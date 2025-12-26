"""AI-powered company classification service."""

import json
import logging
from pathlib import Path
from typing import Optional, Dict, Any

from anthropic import Anthropic

from ..models import Victim
from ..models.orm import CompanyType

logger = logging.getLogger(__name__)

# Load prompts
PROMPTS_DIR = Path(__file__).parent / "prompts"


def load_prompt(filename: str) -> str:
    """Load a prompt template from file."""
    prompt_path = PROMPTS_DIR / filename
    with open(prompt_path, "r") as f:
        return f.read()


CLASSIFY_PROMPT = load_prompt("classify_company.txt")
VERIFY_PROMPT = load_prompt("verify_classification.txt")


async def classify_victim(victim: Victim, api_key: str) -> Dict[str, Any]:
    """Classify a victim using AI.

    Args:
        victim: Victim record to classify
        api_key: Anthropic API key

    Returns:
        Dictionary with classification results including confidence
    """
    client = Anthropic(api_key=api_key)

    # Format prompt
    prompt = CLASSIFY_PROMPT.format(
        victim_raw=victim.victim_raw,
        description=victim.description or "No description available",
        post_date=victim.post_date.strftime("%Y-%m-%d"),
        group_name=victim.group_name
    )

    try:
        # Step 1: Initial classification
        logger.info(f"Classifying victim: {victim.victim_raw}")

        response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": prompt
            }]
        )

        # Parse JSON response
        classification_text = response.content[0].text

        # Extract JSON from response (might be wrapped in markdown)
        if "```json" in classification_text:
            classification_text = classification_text.split("```json")[1].split("```")[0].strip()
        elif "```" in classification_text:
            classification_text = classification_text.split("```")[1].split("```")[0].strip()

        classification = json.loads(classification_text)

        # Step 2: Self-verification
        verification_prompt = VERIFY_PROMPT.format(
            victim_raw=victim.victim_raw,
            description=victim.description or "No description available",
            classification_json=json.dumps(classification, indent=2)
        )

        verify_response = client.messages.create(
            model="claude-sonnet-4-5-20250929",
            max_tokens=1024,
            messages=[{
                "role": "user",
                "content": verification_prompt
            }]
        )

        verification_text = verify_response.content[0].text

        # Extract JSON from verification
        if "```json" in verification_text:
            verification_text = verification_text.split("```json")[1].split("```")[0].strip()
        elif "```" in verification_text:
            verification_text = verification_text.split("```")[1].split("```")[0].strip()

        verification = json.loads(verification_text)

        # Combine results
        result = {
            "success": True,
            "company_name": classification.get("company_name"),
            "company_type": classification.get("company_type", "unknown"),
            "country": classification.get("country"),
            "region": classification.get("region"),
            "is_sec_regulated": classification.get("is_sec_regulated", False),
            "sec_cik": classification.get("sec_cik"),
            "confidence": verification.get("confidence", "medium"),
            "ai_notes": f"{classification.get('notes', '')}\\n\\nVerification: {verification.get('verification_notes', '')}",
            "issues_found": verification.get("issues_found", []),
            "recommendation": verification.get("recommendation", "flag_for_review")
        }

        logger.info(f"Classification complete: {result['company_name']} ({result['confidence']} confidence)")
        return result

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {e}")
        logger.error(f"Response text: {classification_text if 'classification_text' in locals() else 'N/A'}")
        return {
            "success": False,
            "error": f"Failed to parse AI response: {str(e)}",
            "confidence": "low"
        }
    except Exception as e:
        logger.error(f"Error classifying victim {victim.id}: {e}")
        return {
            "success": False,
            "error": str(e),
            "confidence": "low"
        }


async def classify_batch(victims: list[Victim], api_key: str, max_concurrent: int = 3) -> list[Dict[str, Any]]:
    """Classify multiple victims concurrently.

    Args:
        victims: List of victims to classify
        api_key: Anthropic API key
        max_concurrent: Maximum concurrent API calls

    Returns:
        List of classification results
    """
    import asyncio

    # Create semaphore to limit concurrency
    semaphore = asyncio.Semaphore(max_concurrent)

    async def classify_with_limit(victim):
        async with semaphore:
            return await classify_victim(victim, api_key)

    # Process all victims
    results = await asyncio.gather(*[classify_with_limit(v) for v in victims])

    return results
