"""SQLAlchemy ORM models for leak-monitor.

IMPORTANT: SQLAlchemy enum columns use values_callable to ensure lowercase
values are sent to PostgreSQL (which expects lowercase enum values).
"""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Column, String, Text, Boolean, Integer, DateTime, Date,
    Enum as SQLEnum, UniqueConstraint, Index
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base

Base = declarative_base()


# --- Enums ---

class CompanyType(str, Enum):
    """Classification of victim company."""
    PUBLIC = "public"
    PRIVATE = "private"
    GOVERNMENT = "government"
    UNKNOWN = "unknown"


class ReviewStatus(str, Enum):
    """Review workflow status."""
    PENDING = "pending"
    REVIEWED = "reviewed"


class LifecycleStatus(str, Enum):
    """Lifecycle status for soft delete and flagging."""
    ACTIVE = "active"
    FLAGGED = "flagged"
    DELETED = "deleted"


# --- SQLAlchemy ORM Models ---

class MonitorORM(Base):
    """SQLAlchemy model for monitoring tasks."""
    __tablename__ = "monitors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_name = Column(String(100), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    poll_interval_hours = Column(Integer, nullable=False, default=6)
    auto_expire_days = Column(Integer, default=30)
    is_active = Column(Boolean, nullable=False, default=True)
    last_poll_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)


class VictimORM(Base):
    """SQLAlchemy model for victim records."""
    __tablename__ = "victims"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Raw data from RansomLook
    group_name = Column(String(100), nullable=False)
    victim_raw = Column(String(500), nullable=False)
    post_date = Column(DateTime(timezone=True), nullable=False)
    description = Column(Text, nullable=True)
    screenshot_url = Column(String(500), nullable=True)
    data_link = Column(String(500), nullable=True)

    # Enriched company information
    company_name = Column(String(255), nullable=True)
    # CRITICAL: values_callable ensures lowercase values sent to PostgreSQL
    company_type = Column(
        SQLEnum(
            CompanyType,
            name="company_type",
            create_type=False,
            values_callable=lambda x: [e.value for e in x]
        ),
        nullable=False,
        default=CompanyType.UNKNOWN
    )
    region = Column(String(100), nullable=True)
    country = Column(String(100), nullable=True)

    # SEC/Regulatory fields
    is_sec_regulated = Column(Boolean, default=False)
    sec_cik = Column(String(20), nullable=True)
    stock_ticker = Column(String(100), nullable=True)

    # Subsidiary tracking
    is_subsidiary = Column(Boolean, default=False)
    parent_company = Column(String(255), nullable=True)

    # ADR tracking
    has_adr = Column(Boolean, default=False)

    # SEC 8-K correlation
    has_8k_filing = Column(Boolean, nullable=True, default=None)
    sec_8k_date = Column(Date, nullable=True)
    sec_8k_url = Column(String(500), nullable=True)
    sec_8k_source = Column(String(20), nullable=True)  # "edgar" or "tracker"
    sec_8k_item = Column(String(20), nullable=True)    # "1.05", "7.01", etc.
    disclosure_days = Column(Integer, nullable=True)

    # AI Analysis fields (new for leak-monitor)
    confidence_score = Column(String(10), nullable=True)
    ai_notes = Column(Text, nullable=True)
    news_found = Column(Boolean, nullable=True, default=None)
    news_summary = Column(Text, nullable=True)
    news_sources = Column(JSONB, nullable=True)
    first_news_date = Column(Date, nullable=True)
    disclosure_acknowledged = Column(Boolean, nullable=True, default=None)

    # Healthcare classification
    healthcare_classification = Column(String(20), nullable=False, default="none")
    healthcare_blurb = Column(Text, nullable=True)

    # Review workflow
    # CRITICAL: values_callable ensures lowercase values sent to PostgreSQL
    review_status = Column(
        SQLEnum(
            ReviewStatus,
            name="review_status",
            create_type=False,
            values_callable=lambda x: [e.value for e in x]
        ),
        nullable=False,
        default=ReviewStatus.PENDING
    )
    notes = Column(Text, nullable=True)

    # Lifecycle management (soft delete, flagging)
    lifecycle_status = Column(
        SQLEnum(
            LifecycleStatus,
            name="lifecycle_status",
            create_type=False,
            values_callable=lambda x: [e.value for e in x]
        ),
        nullable=False,
        default=LifecycleStatus.ACTIVE
    )
    flag_reason = Column(String(255), nullable=True)

    # Metadata
    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('group_name', 'victim_raw', 'post_date', name='unique_victim_post'),
        Index('idx_victims_group_name', 'group_name'),
        Index('idx_victims_post_date', 'post_date'),
        Index('idx_victims_review_status', 'review_status'),
    )
