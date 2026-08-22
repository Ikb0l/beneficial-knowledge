-- Prevent duplicate tournament reminders per user/tournament/type

-- Deduplicate existing reminders (keep newest)
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, type, data->>'tournamentId'
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM notifications
  WHERE type IN ('tournament_reminder_1h', 'tournament_reminder_15m')
    AND data ? 'tournamentId'
)
DELETE FROM notifications n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

-- Enforce uniqueness for reminders
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_tournament_reminder_unique
ON notifications (user_id, type, (data->>'tournamentId'))
WHERE type IN ('tournament_reminder_1h', 'tournament_reminder_15m');