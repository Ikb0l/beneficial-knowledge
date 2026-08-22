-- Tournament bot participants and policy support
-- - Fill missing slots with bot participants
-- - Replace missing/disconnected players with bots pre-match
-- - Admin-configurable bot difficulty and reward fairness controls

CREATE TABLE IF NOT EXISTS tournament_bot_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_key VARCHAR(64) NOT NULL UNIQUE,
    display_name VARCHAR(128) NOT NULL,
    avatar_url TEXT,
    difficulty_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tournament_bot_profiles (bot_key, display_name, difficulty_overrides, is_active)
VALUES
    ('atlas', 'Atlas Bot', '{}'::jsonb, true),
    ('nova', 'Nova Bot', '{}'::jsonb, true),
    ('orion', 'Orion Bot', '{}'::jsonb, true),
    ('quark', 'Quark Bot', '{}'::jsonb, true),
    ('zenith', 'Zenith Bot', '{}'::jsonb, true),
    ('lumen', 'Lumen Bot', '{}'::jsonb, true),
    ('cipher', 'Cipher Bot', '{}'::jsonb, true),
    ('vortex', 'Vortex Bot', '{}'::jsonb, true)
ON CONFLICT (bot_key) DO NOTHING;

ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS bot_policy JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tournament_participants
    ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT false;

UPDATE tournament_participants
SET is_bot = false
WHERE is_bot IS NULL
  AND user_id IS NOT NULL;

ALTER TABLE tournament_participants
    ADD COLUMN IF NOT EXISTS bot_profile_id UUID;

ALTER TABLE tournament_participants DROP CONSTRAINT IF EXISTS tournament_participants_bot_profile_fkey;
ALTER TABLE tournament_participants
    ADD CONSTRAINT tournament_participants_bot_profile_fkey
    FOREIGN KEY (bot_profile_id)
    REFERENCES tournament_bot_profiles(id)
    ON DELETE SET NULL;

ALTER TABLE tournament_participants
    ADD COLUMN IF NOT EXISTS bot_influenced BOOLEAN DEFAULT false;

UPDATE tournament_participants
SET bot_influenced = false
WHERE bot_influenced IS NULL;

-- Safety backfill for any legacy rows with null user_id values.
WITH fallback_bot AS (
    SELECT id
    FROM tournament_bot_profiles
    ORDER BY bot_key ASC
    LIMIT 1
)
UPDATE tournament_participants tp
SET is_bot = true,
    bot_profile_id = COALESCE(tp.bot_profile_id, (SELECT id FROM fallback_bot)),
    status = CASE WHEN tp.status = 'registered' THEN 'registered' ELSE 'active' END
WHERE tp.user_id IS NULL;

UPDATE tournament_participants
SET bot_profile_id = NULL,
    is_bot = false
WHERE user_id IS NOT NULL;

ALTER TABLE tournament_participants
    ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE tournament_participants
    ALTER COLUMN is_bot SET DEFAULT false;
ALTER TABLE tournament_participants
    ALTER COLUMN is_bot SET NOT NULL;

ALTER TABLE tournament_participants
    ALTER COLUMN bot_influenced SET DEFAULT false;
ALTER TABLE tournament_participants
    ALTER COLUMN bot_influenced SET NOT NULL;

ALTER TABLE tournament_participants DROP CONSTRAINT IF EXISTS tournament_participants_human_or_bot_check;
ALTER TABLE tournament_participants
    ADD CONSTRAINT tournament_participants_human_or_bot_check
    CHECK (
        (is_bot = false AND user_id IS NOT NULL AND bot_profile_id IS NULL)
        OR
        (is_bot = true AND user_id IS NULL AND bot_profile_id IS NOT NULL)
    ) NOT VALID;

ALTER TABLE tournament_participants
    VALIDATE CONSTRAINT tournament_participants_human_or_bot_check;

CREATE INDEX IF NOT EXISTS idx_tournament_bot_profiles_active
    ON tournament_bot_profiles(is_active, bot_key);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_bot
    ON tournament_participants(tournament_id, is_bot);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_bot_profile
    ON tournament_participants(bot_profile_id)
    WHERE bot_profile_id IS NOT NULL;

INSERT INTO game_config (config_key, config_value, description)
VALUES
    (
        'bot_tournament_default_policy',
        '{
          "enabled": true,
          "fillOnStart": true,
          "replaceMissingBeforeMatch": true,
          "botMmr": 1850,
          "rewardCoinMultiplier": 0.5,
          "skipMmrBonusWhenBotInfluenced": true
        }'::jsonb,
        'Global policy for tournament bot fill/replacement and reward fairness'
    ),
    (
        'bot_tournament_difficulty_profile',
        '{
          "baseAccuracy": 0.9,
          "minAccuracy": 0.72,
          "maxAccuracy": 0.985,
          "roundAccuracyBonus": 0.012,
          "minDelayMs": 900,
          "maxDelayMs": 2800,
          "roundDelayReductionMs": 110,
          "nearMissChance": 0.72
        }'::jsonb,
        'Global tournament bot difficulty profile'
    )
ON CONFLICT (config_key) DO NOTHING;
