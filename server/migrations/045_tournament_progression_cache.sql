-- Tournament Progression Cache
-- - Adds last_progression_at to tournaments so syncTournamentStatuses
--   can skip recently-progressed tournaments instead of re-running
--   expensive bracket scans on every read.
-- - Adds the new column and backfills existing in_progress tournaments.

ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS last_progression_at TIMESTAMPTZ;

-- Backfill: set for currently in_progress tournaments so they get
-- an immediate first-pass progression, then are eligible for caching.
UPDATE tournaments
SET last_progression_at = NOW()
WHERE status = 'in_progress'
  AND last_progression_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_stale_progression
    ON tournaments(status, last_progression_at)
    WHERE status = 'in_progress';
