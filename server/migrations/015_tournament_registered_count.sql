-- Add registered_count to tournaments for atomic registration capacity control
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS registered_count INTEGER DEFAULT 0;

UPDATE tournaments t
SET registered_count = COALESCE(sub.cnt, 0)
FROM (
  SELECT tournament_id, COUNT(*)::int as cnt
  FROM tournament_participants
  GROUP BY tournament_id
) sub
WHERE t.id = sub.tournament_id;

UPDATE tournaments
SET registered_count = 0
WHERE registered_count IS NULL;
