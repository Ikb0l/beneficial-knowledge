-- Standalone vocabulary mini-games (Association + Agility)

CREATE TABLE IF NOT EXISTS vocab_game_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL,
  prompt_word TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  options_json JSONB NOT NULL,
  difficulty_level SMALLINT NOT NULL DEFAULT 3,
  cefr_level TEXT,
  relation_strength NUMERIC(4,3),
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_game_items_mode_check CHECK (mode IN ('association', 'agility')),
  CONSTRAINT vocab_game_items_options_array_check CHECK (
    jsonb_typeof(options_json) = 'array'
    AND jsonb_array_length(options_json) = 3
  ),
  CONSTRAINT vocab_game_items_difficulty_check CHECK (difficulty_level BETWEEN 1 AND 10),
  CONSTRAINT vocab_game_items_cefr_check CHECK (
    cefr_level IS NULL OR cefr_level IN ('a1', 'a2', 'b1', 'b2', 'c1', 'c2')
  ),
  CONSTRAINT vocab_game_items_relation_strength_check CHECK (
    relation_strength IS NULL OR (relation_strength >= 0 AND relation_strength <= 1)
  )
);

CREATE TABLE IF NOT EXISTS vocab_game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  mode TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_sec INTEGER NOT NULL DEFAULT 90,
  score INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  accuracy NUMERIC(6,5) NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT vocab_game_sessions_mode_check CHECK (mode IN ('association', 'agility')),
  CONSTRAINT vocab_game_sessions_duration_check CHECK (duration_sec BETWEEN 10 AND 3600),
  CONSTRAINT vocab_game_sessions_score_check CHECK (score >= 0),
  CONSTRAINT vocab_game_sessions_correct_check CHECK (correct_count >= 0),
  CONSTRAINT vocab_game_sessions_wrong_check CHECK (wrong_count >= 0),
  CONSTRAINT vocab_game_sessions_streak_check CHECK (longest_streak >= 0),
  CONSTRAINT vocab_game_sessions_accuracy_check CHECK (accuracy >= 0 AND accuracy <= 1)
);

CREATE TABLE IF NOT EXISTS vocab_game_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES vocab_game_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  mode TEXT NOT NULL,
  item_id UUID NOT NULL REFERENCES vocab_game_items(id) ON DELETE RESTRICT,
  selected_option TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  response_ms INTEGER NOT NULL DEFAULT 0,
  streak_before INTEGER NOT NULL DEFAULT 0,
  streak_after INTEGER NOT NULL DEFAULT 0,
  score_delta INTEGER NOT NULL DEFAULT 0,
  score_after INTEGER NOT NULL DEFAULT 0,
  difficulty_level SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_game_attempts_mode_check CHECK (mode IN ('association', 'agility')),
  CONSTRAINT vocab_game_attempts_response_check CHECK (response_ms BETWEEN 0 AND 600000),
  CONSTRAINT vocab_game_attempts_streak_before_check CHECK (streak_before >= 0),
  CONSTRAINT vocab_game_attempts_streak_after_check CHECK (streak_after >= 0),
  CONSTRAINT vocab_game_attempts_score_after_check CHECK (score_after >= 0),
  CONSTRAINT vocab_game_attempts_difficulty_check CHECK (difficulty_level BETWEEN 1 AND 10),
  CONSTRAINT vocab_game_attempts_unique_session_item UNIQUE (session_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_vocab_game_items_mode_active
  ON vocab_game_items(mode, is_active, difficulty_level, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_game_sessions_user_mode
  ON vocab_game_sessions(user_id, mode, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_game_sessions_completed
  ON vocab_game_sessions(user_id, ended_at DESC)
  WHERE ended_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vocab_game_attempts_user_mode
  ON vocab_game_attempts(user_id, mode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_game_attempts_session
  ON vocab_game_attempts(session_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_vocab_game_attempts_item
  ON vocab_game_attempts(item_id, created_at DESC);

COMMENT ON TABLE vocab_game_items IS 'Admin-authored items for standalone vocabulary mini-games.';
COMMENT ON TABLE vocab_game_sessions IS 'Per-user timed game sessions for vocabulary mini-games.';
COMMENT ON TABLE vocab_game_attempts IS 'Per-item attempt logs for vocabulary mini-games.';
