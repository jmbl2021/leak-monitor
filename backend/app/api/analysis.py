"""Analysis API endpoints (AI-powered)."""

from typing import List
from uuid import UUID
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..api.deps import get_db, require_anthropic_key
from ..core import database
from ..models import (
    AIClassificationRequest, AIClassificationResult, NewsSearchResult,
    VictimFilter
)
from ..models.orm import CompanyType, ReviewStatus
from ..services.ai_classifier import classify_victim, classify_batch
from ..services.ai_news import search_news_for_victim
from ..services.sec_8k import check_8k_filing

router = APIRouter()


@router.post("/classify", response_model=List[AIClassificationResult])
async def classify_victims(
    request: AIClassificationRequest,
    api_key: str = Depends(require_anthropic_key),
    db: AsyncSession = Depends(get_db)
):
    """AI classify a batch of victims.

    Requires Anthropic API key via X-Anthropic-Key header.

    For each victim:
    1. Uses Claude to research and classify the company
    2. Performs self-verification with confidence scoring
    3. Updates database with results
    4. Auto-marks as reviewed if confidence is high
    """
    results = []

    for victim_id in request.victim_ids:
        # Get victim
        victim = await database.get_victim(db, victim_id)
        if not victim:
            results.append(AIClassificationResult(
                victim_id=victim_id,
                success=False,
                error=f"Victim {victim_id} not found"
            ))
            continue

        # Classify with AI
        classification = await classify_victim(victim, api_key)

        if classification["success"]:
            # Map company type
            try:
                company_type = CompanyType(classification["company_type"])
            except ValueError:
                company_type = CompanyType.UNKNOWN

            # Update database
            updated = await database.update_ai_classification(
                db,
                victim_id=victim_id,
                confidence_score=classification["confidence"],
                ai_notes=classification["ai_notes"],
                company_name=classification.get("company_name"),
                company_type=company_type,
                country=classification.get("country"),
                is_sec_regulated=classification.get("is_sec_regulated", False)
            )

            # Also update region if provided
            if classification.get("region") and updated:
                # Use review_victim to set region
                from ..models import VictimReview
                review = VictimReview(
                    company_name=classification.get("company_name"),
                    company_type=company_type,
                    region=classification.get("region"),
                    country=classification.get("country"),
                    is_sec_regulated=classification.get("is_sec_regulated", False),
                    sec_cik=classification.get("sec_cik"),
                    notes=f"AI classified with {classification['confidence']} confidence"
                )
                await database.review_victim(db, victim_id, review)

            await db.commit()

            results.append(AIClassificationResult(
                victim_id=victim_id,
                success=True,
                confidence=classification["confidence"],
                company_name=classification.get("company_name"),
                company_type=company_type,
                country=classification.get("country"),
                is_sec_regulated=classification.get("is_sec_regulated"),
                ai_notes=classification["ai_notes"]
            ))
        else:
            results.append(AIClassificationResult(
                victim_id=victim_id,
                success=False,
                error=classification.get("error", "Classification failed")
            ))

    return results


@router.post("/news/{victim_id}", response_model=NewsSearchResult)
async def search_news(
    victim_id: UUID,
    api_key: str = Depends(require_anthropic_key),
    db: AsyncSession = Depends(get_db)
):
    """Search for news coverage of a victim's breach.

    Requires Anthropic API key via X-Anthropic-Key header.

    Uses Claude with web search to find news articles about the breach.
    """
    # Get victim
    victim = await database.get_victim(db, victim_id)
    if not victim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Victim {victim_id} not found"
        )

    if not victim.company_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Victim must be classified before searching for news"
        )

    # Search news
    news_data = await search_news_for_victim(victim, api_key)

    if news_data["success"]:
        # Parse first_news_date if present
        first_news_date = None
        if news_data.get("first_news_date"):
            try:
                first_news_date = date.fromisoformat(news_data["first_news_date"])
            except ValueError:
                pass

        # Update database
        await database.update_news_correlation(
            db,
            victim_id=victim_id,
            news_found=news_data["news_found"],
            news_summary=news_data.get("news_summary"),
            news_sources=news_data.get("news_sources"),
            first_news_date=first_news_date,
            disclosure_acknowledged=news_data.get("disclosure_acknowledged")
        )
        await db.commit()

        return NewsSearchResult(
            victim_id=victim_id,
            success=True,
            news_found=news_data["news_found"],
            news_summary=news_data.get("news_summary"),
            news_sources=news_data.get("news_sources"),
            first_news_date=first_news_date,
            disclosure_acknowledged=news_data.get("disclosure_acknowledged")
        )
    else:
        return NewsSearchResult(
            victim_id=victim_id,
            success=False,
            news_found=False,
            error=news_data.get("error")
        )


@router.post("/8k/{victim_id}")
async def check_8k(
    victim_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Check for SEC 8-K filing for a victim.

    Does not require API key - uses public SEC data.
    """
    # Get victim
    victim = await database.get_victim(db, victim_id)
    if not victim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Victim {victim_id} not found"
        )

    if not victim.is_sec_regulated or not victim.sec_cik:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Victim must be SEC-regulated with CIK to check 8-K filings"
        )

    # Check 8-K filing
    try:
        result = await check_8k_filing(
            victim.company_name,
            victim.sec_cik,
            victim.post_date.date()
        )

        if result["found"]:
            # Update database
            await database.update_8k_correlation(
                db,
                victim_id=victim_id,
                has_8k_filing=True,
                sec_8k_date=result.get("filing_date"),
                sec_8k_url=result.get("filing_url"),
                disclosure_days=result.get("disclosure_days")
            )
        else:
            await database.update_8k_correlation(
                db,
                victim_id=victim_id,
                has_8k_filing=False
            )

        await db.commit()

        return {
            "success": True,
            "victim_id": str(victim_id),
            "has_8k_filing": result["found"],
            "filing_date": result.get("filing_date"),
            "filing_url": result.get("filing_url"),
            "disclosure_days": result.get("disclosure_days")
        }

    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error checking 8-K for {victim_id}: {e}")

        return {
            "success": False,
            "victim_id": str(victim_id),
            "error": str(e)
        }


@router.post("/8k/batch")
async def check_8k_batch(
    limit: int = 10,
    db: AsyncSession = Depends(get_db)
):
    """Batch check 8-K filings for SEC-regulated victims.

    Does not require API key - uses public SEC data.
    """
    # Get SEC-regulated victims without 8-K check
    filters = VictimFilter(
        is_sec_regulated=True,
        review_status=ReviewStatus.REVIEWED,
        limit=limit
    )

    victims = await database.list_victims(db, filters)

    # Filter to those with CIK and no 8-K check yet
    to_check = [v for v in victims if v.sec_cik and v.has_8k_filing is None]

    results = []
    for victim in to_check:
        try:
            result = await check_8k_filing(
                victim.company_name,
                victim.sec_cik,
                victim.post_date.date()
            )

            if result["found"]:
                await database.update_8k_correlation(
                    db,
                    victim_id=victim.id,
                    has_8k_filing=True,
                    sec_8k_date=result.get("filing_date"),
                    sec_8k_url=result.get("filing_url"),
                    disclosure_days=result.get("disclosure_days")
                )
            else:
                await database.update_8k_correlation(
                    db,
                    victim_id=victim.id,
                    has_8k_filing=False
                )

            results.append({
                "victim_id": str(victim.id),
                "company_name": victim.company_name,
                "has_8k_filing": result["found"],
                "filing_date": result.get("filing_date"),
                "disclosure_days": result.get("disclosure_days")
            })

        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error checking 8-K for {victim.id}: {e}")

    await db.commit()

    return {
        "success": True,
        "checked": len(results),
        "results": results
    }
