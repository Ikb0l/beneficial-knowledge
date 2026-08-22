-- Prevent duplicate tournament event notifications per user/event context.
-- Keep newest when duplicates already exist.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        user_id,
        type,
        NULLIF(data->>'tournamentId', ''),
        COALESCE(NULLIF(data->>'matchId', ''), '#')
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM notifications
  WHERE type IN (
    'tournament_match_ready',
    'tournament_ready_check',
    'tournament_match_forfeit_win',
    'tournament_match_forfeit_loss',
    'tournament_eliminated',
    'tournament_victory',
    'tournament_complete'
  )
    AND (data ? 'tournamentId')
)
DELETE FROM notifications n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_tournament_event_unique
ON notifications (
  user_id,
  type,
  NULLIF(data->>'tournamentId', ''),
  COALESCE(NULLIF(data->>'matchId', ''), '#')
)
WHERE type IN (
  'tournament_match_ready',
  'tournament_ready_check',
  'tournament_match_forfeit_win',
  'tournament_match_forfeit_loss',
  'tournament_eliminated',
  'tournament_victory',
  'tournament_complete'
)
  AND (data ? 'tournamentId');
