"""SEC 8-K Tracker Client.

Fetches and matches 8-K cybersecurity incident disclosures from
board-cybersecurity.com tracker.

Data source: https://www.board-cybersecurity.com/incidents/tracker/
This tracks SEC 8-K Item 1.05 cybersecurity incident disclosures.
"""

import logging
import re
from dataclasses import dataclass
from datetime import datetime, date, timedelta
from typing import Optional, List

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

TRACKER_URL = "https://www.board-cybersecurity.com/incidents/tracker/"
CACHE_TTL = timedelta(hours=24)


@dataclass
class SEC8KIncident:
    """Represents an SEC 8-K cybersecurity incident disclosure."""
    company_name: str
    disclosure_date: date
    last_update: date
    detail_url: str


class SEC8KTracker:
    """Client for fetching and matching SEC 8-K cybersecurity disclosures."""

    def __init__(self):
        self._cache: List[SEC8KIncident] = []
        self._cache_time: Optional[datetime] = None

    async def fetch_incidents(self, force_refresh: bool = False) -> List[SEC8KIncident]:
        """Fetch all 8-K incidents from tracker.

        Args:
            force_refresh: Bypass cache and fetch fresh data

        Returns:
            List of SEC8KIncident records
        """
        # Check cache
        if not force_refresh and self._cache and self._cache_time:
            if datetime.now() - self._cache_time < CACHE_TTL:
                logger.debug(f"Using cached 8-K data ({len(self._cache)} incidents)")
                return self._cache

        logger.info(f"Fetching 8-K tracker data from {TRACKER_URL}")

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    TRACKER_URL,
                    timeout=30,
                    follow_redirects=True,
                    headers={
                        "User-Agent": "SEC-8K-Research/1.0 (Python httpx)"
                    }
                )
                response.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"Failed to fetch 8-K tracker: {e}")
            return self._cache if self._cache else []

        soup = BeautifulSoup(response.text, 'html.parser')
        table = soup.find('table')
        if not table:
            logger.warning("No table found in tracker page")
            return self._cache if self._cache else []

        incidents = []
        rows = table.find_all('tr')[1:]  # Skip header row

        for row in rows:
            cells = row.find_all('td')
            if len(cells) >= 3:
                last_update = self._parse_date(cells[0].text.strip())
                disclosure_date = self._parse_date(cells[1].text.strip())

                # Get company name and link
                link = cells[2].find('a')
                if link:
                    company_name = link.text.strip()
                    href = link.get('href', '')
                    # Build full URL if relative
                    if href and not href.startswith('http'):
                        detail_url = f"https://www.board-cybersecurity.com/incidents/tracker/{href}"
                    else:
                        detail_url = href
                else:
                    company_name = cells[2].text.strip()
                    detail_url = ""

                if disclosure_date and company_name:
                    incidents.append(SEC8KIncident(
                        company_name=company_name,
                        disclosure_date=disclosure_date,
                        last_update=last_update or disclosure_date,
                        detail_url=detail_url
                    ))

        self._cache = incidents
        self._cache_time = datetime.now()
        logger.info(f"Loaded {len(incidents)} 8-K incidents from tracker")
        return incidents

    def _parse_date(self, date_str: str) -> Optional[date]:
        """Parse a date string in YYYY-MM-DD format."""
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            return None

    def find_match(
        self,
        company_name: str,
        incidents: List[SEC8KIncident]
    ) -> Optional[SEC8KIncident]:
        """Find matching 8-K incident for a company.

        Uses fuzzy matching to account for variations in company names.

        Args:
            company_name: Company name to search for
            incidents: List of SEC8KIncident records to search

        Returns:
            Matching SEC8KIncident or None
        """
        normalized_search = self._normalize_name(company_name)

        for incident in incidents:
            normalized_incident = self._normalize_name(incident.company_name)

            # Exact match after normalization
            if normalized_search == normalized_incident:
                return incident

            # Search name contained in incident name
            if normalized_search in normalized_incident:
                return incident

            # Incident name contained in search name
            if normalized_incident in normalized_search:
                return incident

            # Word-based matching (at least 2 significant words match)
            search_words = set(normalized_search.split())
            incident_words = set(normalized_incident.split())
            # Remove common short words
            common_words = {'THE', 'AND', 'OF', 'FOR', 'A', 'AN'}
            search_words -= common_words
            incident_words -= common_words

            if len(search_words) >= 2 and len(incident_words) >= 2:
                matching_words = search_words & incident_words
                if len(matching_words) >= 2:
                    return incident

        return None

    def _normalize_name(self, name: str) -> str:
        """Normalize company name for matching.

        Removes common suffixes, punctuation, and normalizes case.

        Args:
            name: Company name to normalize

        Returns:
            Normalized company name
        """
        # Convert to uppercase
        name = name.upper().strip()

        # Remove common corporate suffixes
        suffixes = [
            'INC', 'INC.', 'INCORPORATED',
            'CORP', 'CORP.', 'CORPORATION',
            'LLC', 'L.L.C.',
            'LTD', 'LTD.', 'LIMITED',
            'CO', 'CO.', 'COMPANY',
            'S.A.', 'SA',
            'PLC', 'P.L.C.',
            'N.V.', 'NV',
            'AG', 'A.G.',
            'GMBH',
            'HOLDINGS', 'HOLDING',
            'GROUP', 'INTERNATIONAL', 'INTL',
        ]

        for suffix in suffixes:
            # Remove suffix with space or comma before it
            name = re.sub(rf'[,\s]+{re.escape(suffix)}$', '', name)
            name = re.sub(rf'\s+{re.escape(suffix)}\s*$', '', name)

        # Remove punctuation and extra spaces
        name = re.sub(r'[.,\'"()&]', ' ', name)
        name = re.sub(r'\s+', ' ', name)

        return name.strip()


# Singleton instance
_tracker: Optional[SEC8KTracker] = None


def get_sec8k_tracker() -> SEC8KTracker:
    """Get the singleton SEC8KTracker instance."""
    global _tracker
    if _tracker is None:
        _tracker = SEC8KTracker()
    return _tracker


async def check_8k_filing(
    company_name: str,
    sec_cik: str,
    post_date: date
) -> dict:
    """Check for SEC 8-K filing for a company.

    Args:
        company_name: Company name to search for
        sec_cik: SEC Central Index Key (not currently used but kept for compatibility)
        post_date: Date the victim was posted on ransomware leak site

    Returns:
        Dictionary with:
            - found: bool - Whether a matching 8-K was found
            - filing_date: Optional[date] - Date of 8-K filing
            - filing_url: Optional[str] - URL to filing details
            - disclosure_days: Optional[int] - Days between post_date and filing_date
    """
    tracker = get_sec8k_tracker()

    # Fetch incidents from tracker
    incidents = await tracker.fetch_incidents()

    # Find matching incident
    match = tracker.find_match(company_name, incidents)

    if match:
        # Calculate disclosure days (filing date - post date)
        # Positive means they disclosed AFTER the leak
        # Negative means they disclosed BEFORE (or same day as) the leak
        disclosure_days = (match.disclosure_date - post_date).days

        return {
            "found": True,
            "filing_date": match.disclosure_date,
            "filing_url": match.detail_url,
            "disclosure_days": disclosure_days
        }
    else:
        return {
            "found": False,
            "filing_date": None,
            "filing_url": None,
            "disclosure_days": None
        }
