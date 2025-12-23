"""RansomLook.io API client.

API Documentation: https://www.ransomlook.io
Data License: CC BY 4.0 (attribution required)
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from dateutil import parser as date_parser

from ..config import get_config
from ..models import VictimCreate

logger = logging.getLogger(__name__)

# HTTP client timeout settings
TIMEOUT = httpx.Timeout(30.0, connect=10.0)


class RansomLookClient:
    """Client for RansomLook.io API."""

    def __init__(self, base_url: Optional[str] = None):
        """Initialize the client.

        Args:
            base_url: Override the default base URL
        """
        self.base_url = base_url or get_config().ransomlook_base_url
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=TIMEOUT,
                headers={
                    "User-Agent": "leak-monitor/1.0 (threat intelligence tracker)",
                    "Accept": "application/json"
                }
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def list_groups(self) -> list[str]:
        """Get list of all tracked ransomware groups.

        Returns:
            List of group names (lowercase)
        """
        client = await self._get_client()

        try:
            response = await client.get("/api/groups")
            response.raise_for_status()

            data = response.json()
            # API returns dict with group names as keys
            groups = list(data.keys()) if isinstance(data, dict) else data
            logger.info(f"Retrieved {len(groups)} groups from RansomLook")
            return sorted(groups)

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching groups: {e.response.status_code}")
            raise
        except Exception as e:
            logger.error(f"Error fetching groups: {e}")
            raise

    async def get_group_info(self, group_name: str) -> Optional[dict]:
        """Get metadata for a specific group.

        Args:
            group_name: Ransomware group name

        Returns:
            Group metadata dict or None if not found
        """
        client = await self._get_client()

        try:
            response = await client.get(f"/api/group/{group_name.lower()}")

            if response.status_code == 404:
                logger.warning(f"Group not found: {group_name}")
                return None

            response.raise_for_status()
            data = response.json()

            # API returns [group_metadata, posts_array]
            if isinstance(data, list) and len(data) >= 1:
                return data[0]

            return None

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching group {group_name}: {e.response.status_code}")
            raise
        except Exception as e:
            logger.error(f"Error fetching group {group_name}: {e}")
            raise

    async def get_group_posts(
        self,
        group_name: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> list[VictimCreate]:
        """Get victim posts for a specific group.

        Args:
            group_name: Ransomware group name
            start_date: Filter posts on or after this date
            end_date: Filter posts on or before this date

        Returns:
            List of VictimCreate objects ready for database insertion
        """
        client = await self._get_client()

        try:
            response = await client.get(f"/api/group/{group_name.lower()}")

            if response.status_code == 404:
                logger.warning(f"Group not found: {group_name}")
                return []

            response.raise_for_status()
            data = response.json()

            # API returns [group_metadata, posts_array]
            if not isinstance(data, list) or len(data) < 2:
                logger.warning(f"Unexpected API response format for {group_name}")
                return []

            posts_data = data[1]

            # posts_data is an object with numeric keys (0, 1, 2, ...)
            # Convert to list of posts
            if isinstance(posts_data, dict):
                posts = list(posts_data.values())
            elif isinstance(posts_data, list):
                posts = posts_data
            else:
                logger.warning(f"Unexpected posts format for {group_name}")
                return []

            logger.info(f"Retrieved {len(posts)} total posts for {group_name}")

            # Parse and filter posts
            victims = []
            for post in posts:
                victim = self._parse_post(group_name, post)
                if victim is None:
                    continue

                # Apply date filters
                if start_date and victim.post_date < start_date:
                    continue
                if end_date and victim.post_date > end_date:
                    continue

                victims.append(victim)

            logger.info(
                f"Filtered to {len(victims)} posts for {group_name} "
                f"(start={start_date}, end={end_date})"
            )
            return victims

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching posts for {group_name}: {e.response.status_code}")
            raise
        except Exception as e:
            logger.error(f"Error fetching posts for {group_name}: {e}")
            raise

    def _parse_post(self, group_name: str, post: dict) -> Optional[VictimCreate]:
        """Parse a raw post into a VictimCreate object.

        Args:
            group_name: The ransomware group name
            post: Raw post data from API

        Returns:
            VictimCreate object or None if parsing fails
        """
        try:
            # Required fields
            victim_raw = post.get("post_title", "").strip()
            discovered = post.get("discovered", "")

            if not victim_raw or not discovered:
                logger.debug(f"Skipping post with missing required fields: {post}")
                return None

            # Parse the discovery timestamp
            # Format: "2025-12-12 16:27:12.699047"
            try:
                post_date = date_parser.parse(discovered)
                # Ensure timezone awareness
                if post_date.tzinfo is None:
                    post_date = post_date.replace(tzinfo=timezone.utc)
            except Exception as e:
                logger.warning(f"Failed to parse date '{discovered}': {e}")
                return None

            # Optional fields
            description = post.get("description", "").strip() or None
            screenshot_url = post.get("screen")
            data_link = post.get("link") or post.get("magnet")

            # Build screenshot URL if relative path
            if screenshot_url and not screenshot_url.startswith("http"):
                screenshot_url = f"{self.base_url}/{screenshot_url}"

            return VictimCreate(
                group_name=group_name.lower(),
                victim_raw=victim_raw,
                post_date=post_date,
                description=description,
                screenshot_url=screenshot_url,
                data_link=data_link
            )

        except Exception as e:
            logger.warning(f"Failed to parse post: {e}")
            return None

    async def get_recent_posts(self, limit: int = 100) -> list[VictimCreate]:
        """Get recent posts across all groups.

        Args:
            limit: Maximum number of posts to return

        Returns:
            List of VictimCreate objects
        """
        client = await self._get_client()

        try:
            response = await client.get("/api/recent")
            response.raise_for_status()

            posts = response.json()
            if not isinstance(posts, list):
                logger.warning("Unexpected format for recent posts")
                return []

            victims = []
            for post in posts[:limit]:
                group_name = post.get("group_name", "unknown")
                victim = self._parse_post(group_name, post)
                if victim:
                    victims.append(victim)

            logger.info(f"Retrieved {len(victims)} recent posts")
            return victims

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching recent posts: {e.response.status_code}")
            raise
        except Exception as e:
            logger.error(f"Error fetching recent posts: {e}")
            raise

    async def group_exists(self, group_name: str) -> bool:
        """Check if a group exists in RansomLook.

        Args:
            group_name: Ransomware group name to check

        Returns:
            True if group exists, False otherwise
        """
        groups = await self.list_groups()
        return group_name.lower() in [g.lower() for g in groups]


# Module-level client instance
_client: Optional[RansomLookClient] = None


def get_ransomlook_client() -> RansomLookClient:
    """Get the global RansomLook client instance."""
    global _client
    if _client is None:
        _client = RansomLookClient()
    return _client


async def close_ransomlook_client() -> None:
    """Close the global RansomLook client."""
    global _client
    if _client:
        await _client.close()
        _client = None
