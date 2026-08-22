-- Web auth session tokens and FK constraints

-- Add session token fields for web auth
ALTER TABLE web_credentials
  ADD COLUMN IF NOT EXISTS session_token_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS session_token_expires_at TIMESTAMPTZ;

-- Optional FK constraints to maintain referential integrity (compatible with older Postgres)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_referral_codes_creator') THEN
    ALTER TABLE referral_codes
      ADD CONSTRAINT fk_referral_codes_creator
      FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_referral_usage_user') THEN
    ALTER TABLE referral_usage
      ADD CONSTRAINT fk_referral_usage_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_web_credentials_user') THEN
    ALTER TABLE web_credentials
      ADD CONSTRAINT fk_web_credentials_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_referral_codes_user') THEN
    ALTER TABLE user_referral_codes
      ADD CONSTRAINT fk_user_referral_codes_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Indexes for session token lookups
CREATE INDEX IF NOT EXISTS idx_web_credentials_session_token_hash
  ON web_credentials(session_token_hash)
  WHERE session_token_hash IS NOT NULL;
