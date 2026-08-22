-- Enforce one active outgoing and one active incoming challenge per user.
-- Keep newest pending row and auto-decline older duplicates before adding unique indexes.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY challenger_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM pending_challenges
  WHERE status = 'pending'
)
UPDATE pending_challenges p
SET status = 'auto_declined'
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY challenged_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM pending_challenges
  WHERE status = 'pending'
)
UPDATE pending_challenges p
SET status = 'auto_declined'
FROM ranked r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_challenges_challenger_single_pending
ON pending_challenges (challenger_id)
WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_challenges_challenged_single_pending
ON pending_challenges (challenged_id)
WHERE status = 'pending';
