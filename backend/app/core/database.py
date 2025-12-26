"""Database operations for leak-monitor."""

import logging
from contextlib import asynccontextmanager
from datetime import datetime, date, timedelta, timezone
from typing import Optional, AsyncGenerator
from uuid import UUID

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import (
    create_async_engine,
    AsyncSession,
    async_sessionmaker
)
from sqlalchemy.dialects.postgresql import insert

from ..config import get_config
from ..models import (
    Base, MonitorORM, VictimORM,
    MonitorCreate, Monitor, VictimCreate, Victim, VictimReview, VictimFilter,
    ReviewStatus, CompanyType, LifecycleStatus, HealthStatus
)

logger = logging.getLogger(__name__)

# Global engine and session factory
_engine = None
_session_factory = None


async def init_db() -> None:
    """Initialize database connection."""
    global _engine, _session_factory

    config = get_config()

    # Convert postgresql:// to postgresql+asyncpg://
    db_url = config.database_url
    if db_url.startswith("postgresql://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

    _engine = create_async_engine(
        db_url,
        echo=(config.log_level == "DEBUG"),
        pool_size=5,
        max_overflow=10
    )

    _session_factory = async_sessionmaker(
        _engine,
        class_=AsyncSession,
        expire_on_commit=False
    )

    logger.info("Database connection initialized")


async def close_db() -> None:
    """Close database connection."""
    global _engine
    if _engine:
        await _engine.dispose()
        logger.info("Database connection closed")


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Get a database session.

    This is used internally. For FastAPI dependency injection,
    use get_db() from api.deps instead.
    """
    if _session_factory is None:
        await init_db()

    async with _session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# --- Monitor Operations ---

async def create_monitor(session: AsyncSession, data: MonitorCreate) -> Monitor:
    """Create a new monitoring task."""
    # Deactivate any existing active monitor for this group
    result = await session.execute(
        select(MonitorORM).where(
            and_(
                MonitorORM.group_name == data.group_name.lower(),
                MonitorORM.is_active == True
            )
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        existing.is_active = False
        logger.info(f"Deactivated existing monitor for {data.group_name}")

    # Create new monitor
    monitor = MonitorORM(
        group_name=data.group_name.lower(),
        start_date=data.start_date,
        end_date=data.end_date,
        poll_interval_hours=data.poll_interval_hours,
        auto_expire_days=data.auto_expire_days,
        is_active=True
    )
    session.add(monitor)
    await session.flush()
    await session.refresh(monitor)

    logger.info(f"Created monitor for {data.group_name}: {monitor.id}")
    return Monitor.model_validate(monitor)


async def get_monitor(session: AsyncSession, monitor_id: UUID) -> Optional[Monitor]:
    """Get a monitor by ID."""
    result = await session.execute(
        select(MonitorORM).where(MonitorORM.id == monitor_id)
    )
    monitor = result.scalar_one_or_none()
    return Monitor.model_validate(monitor) if monitor else None


async def list_monitors(session: AsyncSession, active_only: bool = False) -> list[Monitor]:
    """List all monitors."""
    query = select(MonitorORM).order_by(MonitorORM.created_at.desc())
    if active_only:
        query = query.where(MonitorORM.is_active == True)

    result = await session.execute(query)
    monitors = result.scalars().all()
    return [Monitor.model_validate(m) for m in monitors]


async def update_monitor_poll_time(session: AsyncSession, monitor_id: UUID) -> None:
    """Update the last poll time for a monitor."""
    result = await session.execute(
        select(MonitorORM).where(MonitorORM.id == monitor_id)
    )
    monitor = result.scalar_one_or_none()
    if monitor:
        monitor.last_poll_at = datetime.now(timezone.utc)


async def deactivate_expired_monitors(session: AsyncSession) -> int:
    """Deactivate monitors that have expired."""
    now = datetime.now(timezone.utc)
    result = await session.execute(
        select(MonitorORM).where(
            and_(
                MonitorORM.is_active == True,
                MonitorORM.auto_expire_days.isnot(None)
            )
        )
    )
    monitors = result.scalars().all()

    count = 0
    for monitor in monitors:
        expire_date = monitor.created_at + timedelta(days=monitor.auto_expire_days)
        if now > expire_date:
            monitor.is_active = False
            count += 1
            logger.info(f"Deactivated expired monitor: {monitor.group_name}")

    return count


async def deactivate_monitor(session: AsyncSession, monitor_id: UUID) -> bool:
    """Manually deactivate a monitor."""
    result = await session.execute(
        select(MonitorORM).where(MonitorORM.id == monitor_id)
    )
    monitor = result.scalar_one_or_none()
    if monitor:
        monitor.is_active = False
        logger.info(f"Deactivated monitor: {monitor.group_name}")
        return True
    return False


# --- Victim Operations ---

async def upsert_victims(session: AsyncSession, victims: list[VictimCreate]) -> tuple[int, int]:
    """Insert victims, skipping duplicates.

    Returns:
        Tuple of (inserted_count, skipped_count)
    """
    if not victims:
        return 0, 0

    inserted = 0
    skipped = 0

    for victim_data in victims:
        stmt = insert(VictimORM).values(
            group_name=victim_data.group_name.lower(),
            victim_raw=victim_data.victim_raw,
            post_date=victim_data.post_date,
            description=victim_data.description,
            screenshot_url=victim_data.screenshot_url,
            data_link=victim_data.data_link
        ).on_conflict_do_nothing(
            constraint='unique_victim_post'
        )

        result = await session.execute(stmt)
        if result.rowcount > 0:
            inserted += 1
        else:
            skipped += 1

    logger.info(f"Upserted victims: {inserted} inserted, {skipped} skipped")
    return inserted, skipped


async def get_victim(session: AsyncSession, victim_id: UUID) -> Optional[Victim]:
    """Get a victim by ID."""
    result = await session.execute(
        select(VictimORM).where(VictimORM.id == victim_id)
    )
    victim = result.scalar_one_or_none()
    return Victim.model_validate(victim) if victim else None


async def list_victims(session: AsyncSession, filters: VictimFilter) -> list[Victim]:
    """List victims with optional filtering."""
    query = select(VictimORM)

    # Apply filters
    conditions = []

    # Hide flagged/deleted by default
    if not filters.include_hidden:
        conditions.append(VictimORM.lifecycle_status == LifecycleStatus.ACTIVE)

    if filters.group_name:
        conditions.append(VictimORM.group_name == filters.group_name.lower())
    if filters.review_status:
        conditions.append(VictimORM.review_status == filters.review_status)
    if filters.company_type:
        conditions.append(VictimORM.company_type == filters.company_type)
    if filters.is_sec_regulated is not None:
        conditions.append(VictimORM.is_sec_regulated == filters.is_sec_regulated)
    if filters.start_date:
        conditions.append(VictimORM.post_date >= datetime.combine(
            filters.start_date, datetime.min.time(), tzinfo=timezone.utc
        ))
    if filters.end_date:
        conditions.append(VictimORM.post_date <= datetime.combine(
            filters.end_date, datetime.max.time(), tzinfo=timezone.utc
        ))

    if conditions:
        query = query.where(and_(*conditions))

    query = query.order_by(VictimORM.post_date.desc())
    query = query.offset(filters.offset).limit(filters.limit)

    result = await session.execute(query)
    victims = result.scalars().all()
    return [Victim.model_validate(v) for v in victims]


async def review_victim(session: AsyncSession, victim_id: UUID, review: VictimReview) -> Optional[Victim]:
    """Update a victim with review data."""
    result = await session.execute(
        select(VictimORM).where(VictimORM.id == victim_id)
    )
    victim = result.scalar_one_or_none()

    if not victim:
        return None

    # Update fields from review
    victim.company_name = review.company_name
    victim.company_type = review.company_type
    victim.region = review.region
    victim.country = review.country
    victim.is_sec_regulated = review.is_sec_regulated
    victim.sec_cik = review.sec_cik
    victim.is_subsidiary = review.is_subsidiary
    victim.parent_company = review.parent_company
    victim.has_adr = review.has_adr
    victim.notes = review.notes
    victim.review_status = ReviewStatus.REVIEWED

    await session.flush()
    await session.refresh(victim)

    logger.info(f"Reviewed victim {victim_id}: {victim.company_name or victim.victim_raw}")
    return Victim.model_validate(victim)


async def update_8k_correlation(
    session: AsyncSession,
    victim_id: UUID,
    has_8k_filing: bool,
    sec_8k_date: Optional[date] = None,
    sec_8k_url: Optional[str] = None,
    disclosure_days: Optional[int] = None
) -> Optional[Victim]:
    """Update a victim with SEC 8-K correlation data."""
    result = await session.execute(
        select(VictimORM).where(VictimORM.id == victim_id)
    )
    victim = result.scalar_one_or_none()

    if not victim:
        return None

    victim.has_8k_filing = has_8k_filing
    victim.sec_8k_date = sec_8k_date
    victim.sec_8k_url = sec_8k_url
    victim.disclosure_days = disclosure_days

    await session.flush()
    await session.refresh(victim)

    logger.info(f"Updated 8-K correlation for {victim_id}: has_8k={has_8k_filing}")
    return Victim.model_validate(victim)


async def update_ai_classification(
    session: AsyncSession,
    victim_id: UUID,
    confidence_score: Optional[str] = None,
    ai_notes: Optional[str] = None,
    company_name: Optional[str] = None,
    company_type: Optional[CompanyType] = None,
    country: Optional[str] = None,
    is_sec_regulated: Optional[bool] = None
) -> Optional[Victim]:
    """Update a victim with AI classification data."""
    result = await session.execute(
        select(VictimORM).where(VictimORM.id == victim_id)
    )
    victim = result.scalar_one_or_none()

    if not victim:
        return None

    if confidence_score is not None:
        victim.confidence_score = confidence_score
    if ai_notes is not None:
        victim.ai_notes = ai_notes
    if company_name is not None:
        victim.company_name = company_name
    if company_type is not None:
        victim.company_type = company_type
    if country is not None:
        victim.country = country
    if is_sec_regulated is not None:
        victim.is_sec_regulated = is_sec_regulated

    # Auto-mark as reviewed if high confidence
    if confidence_score == "high":
        victim.review_status = ReviewStatus.REVIEWED

    await session.flush()
    await session.refresh(victim)

    logger.info(f"Updated AI classification for {victim_id}: confidence={confidence_score}")
    return Victim.model_validate(victim)


async def update_news_correlation(
    session: AsyncSession,
    victim_id: UUID,
    news_found: bool,
    news_summary: Optional[str] = None,
    news_sources: Optional[list[str]] = None,
    first_news_date: Optional[date] = None,
    disclosure_acknowledged: Optional[bool] = None
) -> Optional[Victim]:
    """Update a victim with news correlation data."""
    result = await session.execute(
        select(VictimORM).where(VictimORM.id == victim_id)
    )
    victim = result.scalar_one_or_none()

    if not victim:
        return None

    victim.news_found = news_found
    victim.news_summary = news_summary
    victim.news_sources = news_sources
    victim.first_news_date = first_news_date
    victim.disclosure_acknowledged = disclosure_acknowledged

    await session.flush()
    await session.refresh(victim)

    logger.info(f"Updated news correlation for {victim_id}: news_found={news_found}")
    return Victim.model_validate(victim)


async def delete_victim(session: AsyncSession, victim_id: UUID) -> bool:
    """Soft delete a victim (set lifecycle_status to deleted)."""
    result = await session.execute(
        select(VictimORM).where(VictimORM.id == victim_id)
    )
    victim = result.scalar_one_or_none()

    if not victim:
        return False

    victim.lifecycle_status = LifecycleStatus.DELETED
    await session.flush()

    logger.info(f"Deleted victim {victim_id}: {victim.victim_raw}")
    return True


async def flag_victim(session: AsyncSession, victim_id: UUID, reason: Optional[str] = None) -> bool:
    """Flag a victim as junk."""
    result = await session.execute(
        select(VictimORM).where(VictimORM.id == victim_id)
    )
    victim = result.scalar_one_or_none()

    if not victim:
        return False

    victim.lifecycle_status = LifecycleStatus.FLAGGED
    victim.flag_reason = reason
    await session.flush()

    logger.info(f"Flagged victim {victim_id}: {victim.victim_raw} - Reason: {reason or 'N/A'}")
    return True


async def restore_victim(session: AsyncSession, victim_id: UUID) -> bool:
    """Restore a deleted or flagged victim to active status."""
    result = await session.execute(
        select(VictimORM).where(VictimORM.id == victim_id)
    )
    victim = result.scalar_one_or_none()

    if not victim:
        return False

    victim.lifecycle_status = LifecycleStatus.ACTIVE
    victim.flag_reason = None
    await session.flush()

    logger.info(f"Restored victim {victim_id}: {victim.victim_raw}")
    return True


async def bulk_delete_victims(session: AsyncSession, victim_ids: list[UUID]) -> int:
    """Bulk soft delete victims."""
    if not victim_ids:
        return 0

    result = await session.execute(
        select(VictimORM).where(VictimORM.id.in_(victim_ids))
    )
    victims = result.scalars().all()

    count = 0
    for victim in victims:
        victim.lifecycle_status = LifecycleStatus.DELETED
        count += 1

    await session.flush()

    logger.info(f"Bulk deleted {count} victims")
    return count


# --- Statistics ---

async def get_stats(session: AsyncSession) -> dict:
    """Get summary statistics."""
    # Active monitors
    result = await session.execute(
        select(func.count()).select_from(MonitorORM).where(
            MonitorORM.is_active == True
        )
    )
    active_monitors = result.scalar_one()

    # Total victims (active only)
    result = await session.execute(
        select(func.count()).select_from(VictimORM).where(
            VictimORM.lifecycle_status == LifecycleStatus.ACTIVE
        )
    )
    total_victims = result.scalar_one()

    # Pending reviews (active only)
    result = await session.execute(
        select(func.count()).select_from(VictimORM).where(
            and_(
                VictimORM.review_status == ReviewStatus.PENDING,
                VictimORM.lifecycle_status == LifecycleStatus.ACTIVE
            )
        )
    )
    pending_reviews = result.scalar_one()

    # Reviewed count (active only)
    result = await session.execute(
        select(func.count()).select_from(VictimORM).where(
            and_(
                VictimORM.review_status == ReviewStatus.REVIEWED,
                VictimORM.lifecycle_status == LifecycleStatus.ACTIVE
            )
        )
    )
    reviewed_count = result.scalar_one()

    # Victims by review status (active only)
    result = await session.execute(
        select(
            VictimORM.review_status,
            func.count()
        ).where(
            VictimORM.lifecycle_status == LifecycleStatus.ACTIVE
        ).group_by(VictimORM.review_status)
    )
    by_status = {row[0].value: row[1] for row in result.all()}

    # Victims by company type (active only)
    result = await session.execute(
        select(
            VictimORM.company_type,
            func.count()
        ).where(
            VictimORM.lifecycle_status == LifecycleStatus.ACTIVE
        ).group_by(VictimORM.company_type)
    )
    by_type = {row[0].value: row[1] for row in result.all()}

    # Victims by group (top 10, active only)
    result = await session.execute(
        select(
            VictimORM.group_name,
            func.count()
        ).where(
            VictimORM.lifecycle_status == LifecycleStatus.ACTIVE
        ).group_by(VictimORM.group_name)
        .order_by(func.count().desc())
        .limit(10)
    )
    by_group = {row[0]: row[1] for row in result.all()}

    return {
        "total_victims": total_victims,
        "pending_count": pending_reviews,
        "reviewed_count": reviewed_count,
        "by_review_status": by_status,
        "by_company_type": by_type,
        "by_group": by_group,
        "active_monitors": active_monitors
    }


async def get_health(session: AsyncSession) -> HealthStatus:
    """Get system health status."""
    try:
        stats = await get_stats(session)
        db_status = "connected"
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_status = f"error: {str(e)}"
        stats = {"active_monitors": 0, "total_victims": 0, "pending_count": 0}

    return HealthStatus(
        status="healthy" if db_status == "connected" else "degraded",
        database=db_status,
        version="1.0.0",
        active_monitors=stats["active_monitors"],
        total_victims=stats["total_victims"],
        pending_reviews=stats["pending_count"]
    )
