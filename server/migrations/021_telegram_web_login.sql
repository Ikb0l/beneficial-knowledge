-- Telegram web login tokens for browser auth via Telegram Login Widget

CREATE TABLE IF NOT EXISTS telegram_login_tokens (
  telegram_id BIGINT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  username TEXT,
  photo_url TEXT,
  auth_date BIGINT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_login_tokens_expires_at
  ON telegram_login_tokens (expires_at);
