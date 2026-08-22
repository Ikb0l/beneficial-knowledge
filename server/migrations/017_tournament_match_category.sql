-- ============================================================================
-- Tournament matches: store per-match category for "mixed" tournaments
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tournament_matches' AND column_name = 'category'
  ) THEN
    ALTER TABLE tournament_matches
      ADD COLUMN category VARCHAR(50);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournament_matches_category
  ON tournament_matches(category)
  WHERE category IS NOT NULL;

