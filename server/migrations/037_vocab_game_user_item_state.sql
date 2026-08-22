-- Personalized learner state for vocabulary game item selection.

CREATE TABLE IF NOT EXISTS vocab_game_user_item_state (
  user_id UUID NOT NULL,
  mode TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES vocab_game_items(id) ON DELETE CASCADE,
  seen_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  avg_response_ms NUMERIC(10,3) NOT NULL DEFAULT 0,
  ema_response_ms NUMERIC(10,3) NOT NULL DEFAULT 0,
  mastery_score NUMERIC(7,6) NOT NULL DEFAULT 0,
  uncertainty_score NUMERIC(7,6) NOT NULL DEFAULT 1,
  due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  last_correct_at TIMESTAMPTZ,
  last_wrong_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mode, item_id),
  CONSTRAINT vocab_game_user_item_state_mode_check CHECK (mode IN ('association', 'agility', 'context', 'recall', 'diction')),
  CONSTRAINT vocab_game_user_item_state_seen_check CHECK (seen_count >= 0),
  CONSTRAINT vocab_game_user_item_state_correct_check CHECK (correct_count >= 0),
  CONSTRAINT vocab_game_user_item_state_wrong_check CHECK (wrong_count >= 0),
  CONSTRAINT vocab_game_user_item_state_skip_check CHECK (skip_count >= 0),
  CONSTRAINT vocab_game_user_item_state_avg_response_check CHECK (avg_response_ms >= 0),
  CONSTRAINT vocab_game_user_item_state_ema_response_check CHECK (ema_response_ms >= 0),
  CONSTRAINT vocab_game_user_item_state_mastery_check CHECK (mastery_score >= 0 AND mastery_score <= 1),
  CONSTRAINT vocab_game_user_item_state_uncertainty_check CHECK (uncertainty_score >= 0 AND uncertainty_score <= 1)
);

CREATE INDEX IF NOT EXISTS idx_vocab_game_user_item_state_due
  ON vocab_game_user_item_state(user_id, mode, due_at ASC);

CREATE INDEX IF NOT EXISTS idx_vocab_game_user_item_state_mastery
  ON vocab_game_user_item_state(user_id, mode, mastery_score ASC, uncertainty_score DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_game_user_item_state_item
  ON vocab_game_user_item_state(item_id, mode);

COMMENT ON TABLE vocab_game_user_item_state IS 'Per-user adaptive memory state for vocabulary game item scheduling and selection.';
