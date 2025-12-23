"""FastAPI dependency injection."""

from typing import AsyncGenerator, Optional
from fastapi import Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.database import get_session, _session_factory, init_db


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for database sessions."""
    from ..core import database

    if database._session_factory is None:
        await init_db()

    async with database._session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_anthropic_key(
    x_anthropic_key: Optional[str] = Header(None, alias="X-Anthropic-Key")
) -> Optional[str]:
    """Get Anthropic API key from header.

    The API key can be provided via:
    1. X-Anthropic-Key header (preferred for user-provided keys)
    2. Environment variable (for server-side key)

    This is used for AI-powered analysis endpoints.
    """
    from ..config import get_config

    # Try header first
    if x_anthropic_key:
        return x_anthropic_key

    # Fall back to environment variable
    config = get_config()
    if config.anthropic_api_key:
        return config.anthropic_api_key

    return None


async def require_anthropic_key(
    api_key: Optional[str] = Header(None, alias="X-Anthropic-Key")
) -> str:
    """Require Anthropic API key.

    Use this dependency for endpoints that require AI functionality.
    Raises 401 if no key is provided.
    """
    key = await get_anthropic_key(api_key)
    if not key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Anthropic API key required. Provide via X-Anthropic-Key header or ANTHROPIC_API_KEY environment variable."
        )
    return key
