-- Adaptive flashcard metadata and session analytics support.

BEGIN;

ALTER TABLE vocab_learner_state
  ADD COLUMN IF NOT EXISTS ease_trend NUMERIC(8,4) NOT NULL DEFAULT 0;

ALTER TABLE vocab_learner_state
  ADD COLUMN IF NOT EXISTS last_exercise_type VARCHAR(60);

ALTER TABLE vocab_review_events
  ADD COLUMN IF NOT EXISTS confidence SMALLINT;

ALTER TABLE vocab_review_events
  ADD COLUMN IF NOT EXISTS hint_used BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE vocab_review_events
  ADD COLUMN IF NOT EXISTS revealed_before_answer BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE vocab_review_events
  ADD COLUMN IF NOT EXISTS client_goal VARCHAR(20);

ALTER TABLE vocab_review_events
  ADD COLUMN IF NOT EXISTS client_focus_mode VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vocab_review_events_confidence_check'
  ) THEN
    ALTER TABLE vocab_review_events
      ADD CONSTRAINT vocab_review_events_confidence_check
      CHECK (confidence IS NULL OR confidence BETWEEN 1 AND 4);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vocab_review_events_client_goal_check'
  ) THEN
    ALTER TABLE vocab_review_events
      ADD CONSTRAINT vocab_review_events_client_goal_check
      CHECK (client_goal IS NULL OR client_goal IN ('quick', 'standard', 'deep'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vocab_review_events_client_focus_check'
  ) THEN
    ALTER TABLE vocab_review_events
      ADD CONSTRAINT vocab_review_events_client_focus_check
      CHECK (client_focus_mode IS NULL OR client_focus_mode IN ('balanced', 'new_first', 'due_first', 'weak_areas'));
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS vocab_session_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_session_events_event_type_check
    CHECK (event_type IN ('started', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_vocab_session_events_user
  ON vocab_session_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_session_events_session
  ON vocab_session_events(session_id, created_at DESC);

COMMIT;
