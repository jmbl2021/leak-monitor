"""Health check endpoint."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..api.deps import get_db
from ..core.database import get_health
from ..models import HealthStatus

router = APIRouter()


@router.get("/health", response_model=HealthStatus)
async def health_check(db: AsyncSession = Depends(get_db)):
    """Check system health and database connectivity."""
    return await get_health(db)
