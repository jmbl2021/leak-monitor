"""AI-powered news correlation service."""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any

from anthropic import Anthropic

from ..models import Victim

logger = logging.getLogger(__name__)

# Load prompts
PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(filename: str) -> str:
    """Load a prompt template from file."""
    prompt_path = PROMPTS_DIR / filename
    with open(prompt_path, "r") as f:
        return f.read()


NEWS_SEARCH_PROMPT = load_prompt("search_news.txt")


async def search_news_for_victim(victim: Victim, api_key: str) -> Dict[str, Any]:
    """Search for news coverage of a victim's breach.

    Args:
        victim: Victim record with company information
        api_key: Anthropic API key

    Returns:
        Dictionary with news search results
    """
    if not victim.company_name:
        return {
            "success": False,
            "error": "Victim must be classified before searching for news",
            "news_found": False
        }

    client = Anthropic(api_key=api_key)

    # Format prompt
    prompt = NEWS_SEARCH_PROMPT.format(
        company_name=victim.company_name,
        post_date=victim.post_date.strftime("%Y-%m-%d"),
        group_name=victim.group_name
    )

    try:
        logger.info(f"Searching news for: {victim.company_name}")

        # Use extended thinking for better analysis
        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=3072,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        # Parse JSON response
        response_text = response.content[0].text

        # Extract JSON from response
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()

        news_data = json.loads(response_text)

        # Build result
        result = {
            "success": True,
            "news_found": news_data.get("news_found", False),
            "disclosure_acknowledged": news_data.get("disclosure_acknowledged"),
            "first_news_date": news_data.get("first_news_date"),
            "news_summary": news_data.get("news_summary"),
            "news_sources": news_data.get("news_sources", []),
            "key_quotes": news_data.get("key_quotes", [])
        }

        logger.info(f"News search complete: {result['news_found']} coverage found")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI news response as JSON: {e}")
        logger.error(f"Response text: {response_text if 'response_text' in locals() else 'N/A'}")
        return {
            "success": False,
            "error": f"Failed to parse AI response: {str(e)}",
            "news_found": False
        }
    except Exception as e:
        logger.error(f"Error searching news for victim {victim.id}: {e}")
        return {
            "success": False,
            "error": str(e),
            "news_found": False
        }
