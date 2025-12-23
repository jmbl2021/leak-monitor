"""Victims API endpoints."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..api.deps import get_db
from ..core import database
from ..models import (
    Victim, VictimReview, VictimFilter, StatsResponse
)
from ..services import create_victims_export

router = APIRouter()


@router.get("", response_model=List[Victim])
async def list_victims(
    group_name: str = None,
    review_status: str = None,
    company_type: str = None,
    is_sec_regulated: bool = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """List victims with optional filtering."""
    from datetime import date
    from ..models.orm import ReviewStatus, CompanyType

    # Build filter object
    filters = VictimFilter(
        group_name=group_name,
        review_status=ReviewStatus(review_status) if review_status else None,
        company_type=CompanyType(company_type) if company_type else None,
        is_sec_regulated=is_sec_regulated,
        start_date=date.fromisoformat(start_date) if start_date else None,
        end_date=date.fromisoformat(end_date) if end_date else None,
        limit=limit,
        offset=offset
    )

    victims = await database.list_victims(db, filters)
    return victims


@router.get("/pending", response_model=List[Victim])
async def list_pending_victims(
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    """Get victims pending classification."""
    from ..models.orm import ReviewStatus

    filters = VictimFilter(
        review_status=ReviewStatus.PENDING,
        limit=limit
    )

    victims = await database.list_victims(db, filters)
    return victims


@router.get("/stats", response_model=StatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    """Get victim statistics."""
    stats = await database.get_stats(db)
    return StatsResponse(**stats)


@router.get("/{victim_id}", response_model=Victim)
async def get_victim(
    victim_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get a single victim by ID."""
    victim = await database.get_victim(db, victim_id)
    if not victim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Victim {victim_id} not found"
        )
    return victim


@router.put("/{victim_id}", response_model=Victim)
async def update_victim(
    victim_id: UUID,
    review: VictimReview,
    db: AsyncSession = Depends(get_db)
):
    """Update victim classification."""
    victim = await database.review_victim(db, victim_id, review)
    if not victim:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Victim {victim_id} not found"
        )
    return victim


@router.post("/export")
async def export_victims(
    group_name: str = None,
    filename: str = None,
    title: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Export victims to Excel.

    Only exports REVIEWED victims to ensure data completeness.
    """
    from ..models.orm import ReviewStatus

    # Get only reviewed victims
    filters = VictimFilter(
        group_name=group_name,
        review_status=ReviewStatus.REVIEWED,
        limit=500  # Max export size
    )

    victims = await database.list_victims(db, filters)

    if not victims:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No reviewed victims found to export"
        )

    # Create export
    filepath = create_victims_export(victims, filename=filename, title=title)

    return {
        "success": True,
        "filepath": str(filepath),
        "count": len(victims),
        "message": f"Exported {len(victims)} victims to {filepath.name}"
    }
