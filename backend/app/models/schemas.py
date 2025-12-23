"""Pydantic schemas for API validation and serialization."""

import uuid
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict

from .orm import CompanyType, ReviewStatus


# --- Monitor Schemas ---

class MonitorCreate(BaseModel):
    """Input model for creating a new monitor."""
    model_config = ConfigDict(str_strip_whitespace=True)

    group_name: str = Field(
        ...,
        description="Ransomware group name (e.g., 'akira', 'lockbit3')",
        min_length=1,
        max_length=100
    )
    start_date: date = Field(
        ...,
        description="Start date for monitoring (YYYY-MM-DD)"
    )
    end_date: Optional[date] = Field(
        default=None,
        description="Optional end date for monitoring (YYYY-MM-DD)"
    )
    poll_interval_hours: int = Field(
        default=6,
        description="How often to poll for new posts (hours)",
        ge=1,
        le=168  # max 1 week
    )
    auto_expire_days: Optional[int] = Field(
        default=30,
        description="Auto-deactivate monitor after N days (null for never)",
        ge=1,
        le=365
    )


class Monitor(BaseModel):
    """Output model for monitor."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_name: str
    start_date: date
    end_date: Optional[date]
    poll_interval_hours: int
    auto_expire_days: Optional[int]
    is_active: bool
    last_poll_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# --- Victim Schemas ---

class VictimCreate(BaseModel):
    """Input model for creating a victim record (from RansomLook)."""
    model_config = ConfigDict(str_strip_whitespace=True)

    group_name: str
    victim_raw: str = Field(..., max_length=500)
    post_date: datetime
    description: Optional[str] = None
    screenshot_url: Optional[str] = None
    data_link: Optional[str] = None


class VictimReview(BaseModel):
    """Input model for reviewing/classifying a victim."""
    model_config = ConfigDict(str_strip_whitespace=True)

    company_name: Optional[str] = Field(
        default=None,
        description="Resolved company name",
        max_length=255
    )
    company_type: CompanyType = Field(
        default=CompanyType.UNKNOWN,
        description="Company classification: public, private, government, unknown"
    )
    region: Optional[str] = Field(
        default=None,
        description="Geographic region (e.g., 'North America', 'EU', 'APAC')",
        max_length=50
    )
    country: Optional[str] = Field(
        default=None,
        description="Country name or ISO code",
        max_length=100
    )
    is_sec_regulated: bool = Field(
        default=False,
        description="Is this company subject to SEC disclosure rules?"
    )
    sec_cik: Optional[str] = Field(
        default=None,
        description="SEC Central Index Key (if SEC regulated)",
        max_length=20
    )
    is_subsidiary: bool = Field(
        default=False,
        description="Is this a subsidiary of another company?"
    )
    parent_company: Optional[str] = Field(
        default=None,
        description="Parent company name (if subsidiary)",
        max_length=255
    )
    has_adr: bool = Field(
        default=False,
        description="Foreign company with American Depositary Receipts?"
    )
    notes: Optional[str] = Field(
        default=None,
        description="Manual notes, ambiguity flags, alternatives"
    )


class Victim(BaseModel):
    """Output model for victim record."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    group_name: str
    victim_raw: str
    post_date: datetime
    description: Optional[str]
    screenshot_url: Optional[str]
    data_link: Optional[str]
    company_name: Optional[str]
    company_type: CompanyType
    region: Optional[str]
    country: Optional[str]
    is_sec_regulated: bool
    sec_cik: Optional[str]
    is_subsidiary: bool
    parent_company: Optional[str]
    has_adr: bool
    # SEC 8-K correlation
    has_8k_filing: Optional[bool]
    sec_8k_date: Optional[date]
    sec_8k_url: Optional[str]
    disclosure_days: Optional[int]
    # AI analysis fields
    confidence_score: Optional[str]
    ai_notes: Optional[str]
    news_found: Optional[bool]
    news_summary: Optional[str]
    news_sources: Optional[List[str]]
    first_news_date: Optional[date]
    disclosure_acknowledged: Optional[bool]
    # Review workflow
    review_status: ReviewStatus
    notes: Optional[str]
    created_at: datetime
    updated_at: datetime


class VictimFilter(BaseModel):
    """Filter options for querying victims."""
    model_config = ConfigDict(str_strip_whitespace=True)

    group_name: Optional[str] = Field(
        default=None,
        description="Filter by ransomware group"
    )
    review_status: Optional[ReviewStatus] = Field(
        default=None,
        description="Filter by review status"
    )
    company_type: Optional[CompanyType] = Field(
        default=None,
        description="Filter by company type"
    )
    is_sec_regulated: Optional[bool] = Field(
        default=None,
        description="Filter by SEC regulation status"
    )
    start_date: Optional[date] = Field(
        default=None,
        description="Filter posts on or after this date"
    )
    end_date: Optional[date] = Field(
        default=None,
        description="Filter posts on or before this date"
    )
    limit: int = Field(
        default=50,
        description="Maximum number of results",
        ge=1,
        le=500
    )
    offset: int = Field(
        default=0,
        description="Number of results to skip",
        ge=0
    )


# --- AI Analysis Schemas ---

class AIClassificationRequest(BaseModel):
    """Request to classify victims using AI."""
    victim_ids: List[uuid.UUID] = Field(
        ...,
        description="List of victim IDs to classify",
        min_length=1,
        max_length=10
    )


class AIClassificationResult(BaseModel):
    """Result of AI classification for a single victim."""
    victim_id: uuid.UUID
    success: bool
    confidence: Optional[str] = None  # high, medium, low
    company_name: Optional[str] = None
    company_type: Optional[CompanyType] = None
    country: Optional[str] = None
    is_sec_regulated: Optional[bool] = None
    ai_notes: Optional[str] = None
    error: Optional[str] = None


class NewsSearchResult(BaseModel):
    """Result of AI news search for a victim."""
    victim_id: uuid.UUID
    success: bool
    news_found: bool
    news_summary: Optional[str] = None
    news_sources: Optional[List[str]] = None
    first_news_date: Optional[date] = None
    disclosure_acknowledged: Optional[bool] = None
    error: Optional[str] = None


# --- System Schemas ---

class HealthStatus(BaseModel):
    """System health status."""
    status: str
    database: str
    version: str
    active_monitors: int
    total_victims: int
    pending_reviews: int


class StatsResponse(BaseModel):
    """Statistics response."""
    total_victims: int
    by_review_status: dict
    by_company_type: dict
    by_group: dict
    pending_count: int
    reviewed_count: int
