-- Ensure tournament activity tracking column exists in schema migrations
-- (previously added only by runtime bootstrap).

ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

UPDATE tournament_matches
SET last_activity_at = COALESCE(last_activity_at, started_at, created_at)
WHERE last_activity_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_matches_last_activity
    ON tournament_matches(last_activity_at)
    WHERE status = 'in_progress' AND last_activity_at IS NOT NULL;
