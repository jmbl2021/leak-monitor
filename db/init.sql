-- Leak Monitor Database Schema
-- Tracks ransomware victim postings from RansomLook.io

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum types
CREATE TYPE company_type AS ENUM ('public', 'private', 'government', 'unknown');
CREATE TYPE review_status AS ENUM ('pending', 'reviewed');

-- Monitors table - tracks active monitoring tasks
CREATE TABLE monitors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    poll_interval_hours INTEGER NOT NULL DEFAULT 6,
    auto_expire_days INTEGER DEFAULT 30,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_poll_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_active_monitor UNIQUE (group_name, is_active)
        DEFERRABLE INITIALLY DEFERRED
);

-- Victims table - stores victim records from leak sites
CREATE TABLE victims (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Raw data from RansomLook
    group_name VARCHAR(100) NOT NULL,
    victim_raw VARCHAR(500) NOT NULL,
    post_date TIMESTAMP WITH TIME ZONE NOT NULL,
    description TEXT,
    screenshot_url VARCHAR(500),
    data_link VARCHAR(500),

    -- Enriched company information
    company_name VARCHAR(255),
    company_type company_type NOT NULL DEFAULT 'unknown',
    region VARCHAR(50),
    country VARCHAR(100),

    -- SEC/Regulatory fields
    is_sec_regulated BOOLEAN DEFAULT false,
    sec_cik VARCHAR(20),

    -- Subsidiary tracking
    is_subsidiary BOOLEAN DEFAULT false,
    parent_company VARCHAR(255),

    -- ADR tracking for foreign companies
    has_adr BOOLEAN DEFAULT false,

    -- SEC 8-K correlation
    has_8k_filing BOOLEAN DEFAULT NULL,
    sec_8k_date DATE,
    sec_8k_url VARCHAR(500),
    disclosure_days INTEGER,

    -- AI analysis fields
    confidence_score VARCHAR(10),
    ai_notes TEXT,
    news_found BOOLEAN DEFAULT NULL,
    news_summary TEXT,
    news_sources JSONB,
    first_news_date DATE,
    disclosure_acknowledged BOOLEAN DEFAULT NULL,

    -- Review workflow
    review_status review_status NOT NULL DEFAULT 'pending',
    notes TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Prevent duplicates
    CONSTRAINT unique_victim_post UNIQUE (group_name, victim_raw, post_date)
);

-- Indexes for common queries
CREATE INDEX idx_victims_group_name ON victims(group_name);
CREATE INDEX idx_victims_post_date ON victims(post_date);
CREATE INDEX idx_victims_review_status ON victims(review_status);
CREATE INDEX idx_victims_company_type ON victims(company_type);
CREATE INDEX idx_monitors_active ON monitors(is_active) WHERE is_active = true;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER victims_updated_at
    BEFORE UPDATE ON victims
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER monitors_updated_at
    BEFORE UPDATE ON monitors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Comments for documentation
COMMENT ON TABLE monitors IS 'Active monitoring tasks for ransomware groups';
COMMENT ON TABLE victims IS 'Victim records collected from ransomware leak sites';
COMMENT ON COLUMN victims.victim_raw IS 'Original victim name/domain as posted on leak site';
COMMENT ON COLUMN victims.is_sec_regulated IS 'Subject to SEC cybersecurity disclosure rules';
COMMENT ON COLUMN victims.has_adr IS 'Foreign company with American Depositary Receipts';
COMMENT ON COLUMN victims.confidence_score IS 'AI classification confidence: high, medium, or low';
COMMENT ON COLUMN victims.ai_notes IS 'AI-generated classification notes and findings';
COMMENT ON COLUMN victims.news_found IS 'Whether news coverage of the incident was found';
COMMENT ON COLUMN victims.disclosure_acknowledged IS 'Whether company publicly acknowledged the incident';
COMMENT ON COLUMN victims.notes IS 'Manual notes including ambiguity flags and alternatives';
