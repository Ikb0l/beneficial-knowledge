-- ============================================================================
-- BLOCK/MUTE SYSTEM
-- ============================================================================

-- Blocked users table
CREATE TABLE IF NOT EXISTS blocked_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    blocked_user_id UUID NOT NULL,
    blocked_at TIMESTAMPTZ DEFAULT NOW(),
    reason VARCHAR(255),
    UNIQUE(user_id, blocked_user_id)
);

-- Pending challenges table
CREATE TABLE IF NOT EXISTS pending_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenger_id UUID NOT NULL,
    challenged_id UUID NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'auto_declined', 'expired_challenger_busy')),
    match_id UUID,
    UNIQUE(challenger_id, challenged_id, status) -- Only one pending challenge per pair
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_blocked_users_user ON blocked_users(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocked ON blocked_users(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_pending_challenges_challenged ON pending_challenges(challenged_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_challenges_expires ON pending_challenges(expires_at) WHERE status = 'pending';
