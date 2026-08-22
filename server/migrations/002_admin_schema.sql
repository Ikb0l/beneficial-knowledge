-- Admin Panel Schema Migration
-- Adds tables for admin users, bans, audit logging, and MMR adjustments

-- Admin users whitelist table
-- Stores Telegram IDs that are authorized as admins
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    admin_level VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (admin_level IN ('admin', 'super_admin')),
    display_name VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID, -- Admin who added this admin (NULL for bootstrapped admins)
    last_login_at TIMESTAMPTZ
);

-- User bans table
-- Tracks all user bans (active and historical)
CREATE TABLE IF NOT EXISTS user_bans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    telegram_id BIGINT,
    banned_by UUID NOT NULL, -- Admin who issued the ban
    reason TEXT NOT NULL,
    is_permanent BOOLEAN DEFAULT false,
    expires_at TIMESTAMPTZ, -- NULL if permanent
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    unbanned_at TIMESTAMPTZ,
    unbanned_by UUID -- Admin who lifted the ban
);

-- Admin audit log table
-- Records all admin actions for accountability
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL,
    admin_telegram_id BIGINT,
    action_type VARCHAR(50) NOT NULL, -- e.g., 'question_create', 'user_ban', 'mmr_adjust'
    target_type VARCHAR(50), -- e.g., 'question', 'user', 'category', 'ban'
    target_id VARCHAR(255),
    old_value JSONB,
    new_value JSONB,
    metadata JSONB, -- Additional context
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MMR adjustment history table
-- Records manual MMR adjustments made by admins
CREATE TABLE IF NOT EXISTS mmr_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    user_telegram_id BIGINT,
    adjusted_by UUID NOT NULL, -- Admin who made the adjustment
    old_mmr INTEGER NOT NULL,
    new_mmr INTEGER NOT NULL,
    adjustment INTEGER NOT NULL, -- Can be positive or negative
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries

-- Admin users: lookup by telegram ID
CREATE INDEX IF NOT EXISTS idx_admin_users_telegram_id
    ON admin_users(telegram_id)
    WHERE is_active = true;

-- User bans: lookup active bans by user
CREATE INDEX IF NOT EXISTS idx_user_bans_user_id
    ON user_bans(user_id)
    WHERE is_active = true;

-- User bans: lookup active bans (for checking expired bans)
CREATE INDEX IF NOT EXISTS idx_user_bans_active_expires
    ON user_bans(is_active, expires_at)
    WHERE is_active = true AND expires_at IS NOT NULL;

-- User bans: lookup by telegram ID
CREATE INDEX IF NOT EXISTS idx_user_bans_telegram_id
    ON user_bans(telegram_id)
    WHERE is_active = true;

-- Audit log: lookup by admin
CREATE INDEX IF NOT EXISTS idx_audit_log_admin
    ON admin_audit_log(admin_id, created_at DESC);

-- Audit log: lookup by target
CREATE INDEX IF NOT EXISTS idx_audit_log_target
    ON admin_audit_log(target_type, target_id, created_at DESC);

-- Audit log: lookup by action type
CREATE INDEX IF NOT EXISTS idx_audit_log_action
    ON admin_audit_log(action_type, created_at DESC);

-- MMR adjustments: lookup by user
CREATE INDEX IF NOT EXISTS idx_mmr_adjustments_user
    ON mmr_adjustments(user_id, created_at DESC);

-- Add columns to existing questions table if they don't exist
DO $$
BEGIN
    -- Add created_by column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'questions' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE questions ADD COLUMN created_by UUID;
    END IF;

    -- Add updated_by column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'questions' AND column_name = 'updated_by'
    ) THEN
        ALTER TABLE questions ADD COLUMN updated_by UUID;
    END IF;
END $$;

-- Function to check if a user is banned
-- Can be called during authentication
CREATE OR REPLACE FUNCTION is_user_banned(p_user_id UUID) RETURNS BOOLEAN AS $$
DECLARE
    v_banned BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM user_bans
        WHERE user_id = p_user_id
        AND is_active = true
        AND (is_permanent = true OR expires_at > NOW())
    ) INTO v_banned;

    RETURN v_banned;
END;
$$ LANGUAGE plpgsql;

-- Function to check if a user is banned by telegram ID
CREATE OR REPLACE FUNCTION is_telegram_user_banned(p_telegram_id BIGINT) RETURNS BOOLEAN AS $$
DECLARE
    v_banned BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM user_bans
        WHERE telegram_id = p_telegram_id
        AND is_active = true
        AND (is_permanent = true OR expires_at > NOW())
    ) INTO v_banned;

    RETURN v_banned;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-expire temporary bans
-- Should be called periodically (e.g., via cron or application logic)
CREATE OR REPLACE FUNCTION expire_temporary_bans() RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE user_bans
    SET is_active = false,
        unbanned_at = NOW()
    WHERE is_active = true
    AND is_permanent = false
    AND expires_at <= NOW();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Comment on tables
COMMENT ON TABLE admin_users IS 'Whitelist of Telegram users authorized as admins';
COMMENT ON TABLE user_bans IS 'User ban records (active and historical)';
COMMENT ON TABLE admin_audit_log IS 'Audit trail for all admin actions';
COMMENT ON TABLE mmr_adjustments IS 'Manual MMR adjustments made by admins';
