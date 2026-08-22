-- Web Authentication and Referral System
-- This migration adds support for web browser authentication with referral code gating

-- Referral codes table
CREATE TABLE IF NOT EXISTS referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE,
    creator_id UUID,
    creator_type VARCHAR(20) NOT NULL CHECK (creator_type IN ('user', 'admin', 'system')),
    max_uses INTEGER NOT NULL DEFAULT 10,
    current_uses INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    notes TEXT
);

-- Track referral code usage
CREATE TABLE IF NOT EXISTS referral_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    used_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(code_id, user_id)
);

-- Web user credentials (for nickname + password login)
CREATE TABLE IF NOT EXISTS web_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    nickname VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    password_salt VARCHAR(64) NOT NULL,
    referral_code_used UUID REFERENCES referral_codes(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- User's own referral code (each user gets one referral code they can share)
CREATE TABLE IF NOT EXISTS user_referral_codes (
    user_id UUID NOT NULL UNIQUE,
    referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_referral_codes_creator ON referral_codes(creator_id) WHERE creator_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_web_credentials_nickname ON web_credentials(nickname);
CREATE INDEX IF NOT EXISTS idx_web_credentials_user_id ON web_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_usage_code_id ON referral_usage(code_id);
CREATE INDEX IF NOT EXISTS idx_referral_usage_user_id ON referral_usage(user_id);
