-- Migration 001: Add lifecycle_status to victims table
-- Date: 2024-12-24
-- Description: Add lifecycle status enum and fields for soft delete and flagging

-- Create lifecycle status enum
CREATE TYPE lifecycle_status AS ENUM ('active', 'flagged', 'deleted');

-- Add lifecycle_status column with default 'active'
ALTER TABLE victims ADD COLUMN lifecycle_status lifecycle_status NOT NULL DEFAULT 'active';

-- Add flag_reason column
ALTER TABLE victims ADD COLUMN flag_reason VARCHAR(255);

-- Create indexes for efficient queries
CREATE INDEX idx_victims_lifecycle_status ON victims(lifecycle_status);
CREATE INDEX idx_victims_active ON victims(id) WHERE lifecycle_status = 'active';

-- Add comment for documentation
COMMENT ON COLUMN victims.lifecycle_status IS 'Lifecycle status: active, flagged (junk), or deleted (soft delete)';
COMMENT ON COLUMN victims.flag_reason IS 'Reason for flagging victim as junk/false positive';
