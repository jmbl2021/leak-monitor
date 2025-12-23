"""Monitors API endpoints."""

from typing import List
from uuid import UUID
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..api.deps import get_db
from ..core import database
from ..models import Monitor, MonitorCreate
from ..services import get_ransomlook_client

router = APIRouter()


@router.get("", response_model=List[Monitor])
async def list_monitors(
    active_only: bool = False,
    db: AsyncSession = Depends(get_db)
):
    """List all monitoring tasks."""
    monitors = await database.list_monitors(db, active_only=active_only)
    return monitors


@router.post("", response_model=Monitor, status_code=status.HTTP_201_CREATED)
async def create_monitor(
    monitor_data: MonitorCreate,
    db: AsyncSession = Depends(get_db)
):
    """Create a new monitoring task.

    This will:
    1. Validate the group exists on RansomLook
    2. Deactivate any existing active monitor for this group
    3. Create the new monitor
    4. Perform an initial poll for victims
    """
    # Validate group exists
    client = get_ransomlook_client()
    if not await client.group_exists(monitor_data.group_name):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ransomware group '{monitor_data.group_name}' not found on RansomLook"
        )

    # Create monitor
    monitor = await database.create_monitor(db, monitor_data)

    # Perform initial poll
    try:
        start_datetime = datetime.combine(
            monitor_data.start_date,
            datetime.min.time(),
            tzinfo=timezone.utc
        )
        end_datetime = datetime.combine(
            monitor_data.end_date,
            datetime.max.time(),
            tzinfo=timezone.utc
        ) if monitor_data.end_date else None

        victims = await client.get_group_posts(
            monitor_data.group_name,
            start_date=start_datetime,
            end_date=end_datetime
        )

        if victims:
            inserted, skipped = await database.upsert_victims(db, victims)
            # Update last poll time
            await database.update_monitor_poll_time(db, monitor.id)
            await db.commit()

    except Exception as e:
        # Log error but don't fail monitor creation
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed initial poll for monitor {monitor.id}: {e}")

    return monitor


@router.delete("/{monitor_id}")
async def deactivate_monitor(
    monitor_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Deactivate a monitoring task."""
    success = await database.deactivate_monitor(db, monitor_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Monitor {monitor_id} not found"
        )
    return {"success": True, "message": f"Monitor {monitor_id} deactivated"}


@router.post("/{monitor_id}/poll")
async def poll_monitor(
    monitor_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Manually poll a monitor for new victims."""
    monitor = await database.get_monitor(db, monitor_id)
    if not monitor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Monitor {monitor_id} not found"
        )

    if not monitor.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot poll inactive monitor"
        )

    # Poll RansomLook
    client = get_ransomlook_client()

    start_datetime = datetime.combine(
        monitor.start_date,
        datetime.min.time(),
        tzinfo=timezone.utc
    )
    end_datetime = datetime.combine(
        monitor.end_date,
        datetime.max.time(),
        tzinfo=timezone.utc
    ) if monitor.end_date else None

    victims = await client.get_group_posts(
        monitor.group_name,
        start_date=start_datetime,
        end_date=end_datetime
    )

    # Upsert victims
    inserted, skipped = await database.upsert_victims(db, victims)

    # Update last poll time
    await database.update_monitor_poll_time(db, monitor_id)
    await db.commit()

    return {
        "success": True,
        "monitor_id": str(monitor_id),
        "group_name": monitor.group_name,
        "total_posts": len(victims),
        "inserted": inserted,
        "skipped": skipped,
        "message": f"Polled {monitor.group_name}: {inserted} new, {skipped} duplicates"
    }


@router.get("/groups/list", response_model=List[str])
async def list_groups():
    """List all available ransomware groups from RansomLook."""
    client = get_ransomlook_client()
    groups = await client.list_groups()
    return groups
