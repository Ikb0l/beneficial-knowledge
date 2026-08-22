-- ============================================================================
-- TOURNAMENT TABLE FIXES
-- Adds missing columns referenced by features.ts
-- ============================================================================

-- Add winner_id to tournaments table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tournaments' AND column_name = 'winner_id'
    ) THEN
        ALTER TABLE tournaments ADD COLUMN winner_id UUID;
    END IF;
END $$;

-- Add completed_at to tournaments table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tournaments' AND column_name = 'completed_at'
    ) THEN
        ALTER TABLE tournaments ADD COLUMN completed_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add eliminated_at to tournament_participants table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tournament_participants' AND column_name = 'eliminated_at'
    ) THEN
        ALTER TABLE tournament_participants ADD COLUMN eliminated_at TIMESTAMPTZ;
    END IF;
END $$;

-- Add index for completed tournaments
CREATE INDEX IF NOT EXISTS idx_tournaments_completed ON tournaments(completed_at DESC) WHERE status = 'completed';

-- Add index for eliminated participants
CREATE INDEX IF NOT EXISTS idx_tournament_participants_eliminated ON tournament_participants(eliminated_at) WHERE eliminated_at IS NOT NULL;

-- ============================================================================
-- ADD TELEGRAM BOT TOKEN TO GAME CONFIG
-- Note: For production, prefer environment variables. DB config is for dynamic updates.
-- ============================================================================

INSERT INTO game_config (config_key, config_value, description)
VALUES ('telegram_bot_token', '""', 'Telegram Bot Token (leave empty to use env var TELEGRAM_BOT_TOKEN)')
ON CONFLICT (config_key) DO NOTHING;
