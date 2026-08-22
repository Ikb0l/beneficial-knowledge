\set ON_ERROR_STOP 1
\if :{?apply}
\else
\set apply 0
\endif
\if :{?backup_suffix}
\else
\set backup_suffix dryrun
\endif

\echo [purge] Resolving target users (custom_id LIKE 'quizzy_%', gamesPlayed=0, no tournament participation)...
DROP TABLE IF EXISTS tmp_quizzy_target;
CREATE TEMP TABLE tmp_quizzy_target AS
SELECT
  u.id,
  u.username,
  u.custom_id,
  u.create_time
FROM users u
LEFT JOIN storage s
  ON s.user_id = u.id
  AND s.collection = 'player_data'
  AND s.key = 'global_mmr'
WHERE u.custom_id LIKE 'quizzy_%'
  AND (
    CASE
      WHEN (s.value->>'gamesPlayed') ~ '^-?[0-9]+$' THEN (s.value->>'gamesPlayed')::int
      ELSE 0
    END
  ) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM tournament_participants tp
    WHERE tp.user_id = u.id
  );

\echo [purge] Target user count:
SELECT COUNT(*) AS target_users FROM tmp_quizzy_target;

\echo [purge] Sample usernames:
SELECT username, custom_id, create_time
FROM tmp_quizzy_target
ORDER BY create_time ASC, username ASC
LIMIT 20;

\echo [purge] Current impact counts for target users:
SELECT 'users' AS table_name, COUNT(*) AS rows
FROM users u
WHERE u.id IN (SELECT id FROM tmp_quizzy_target)
UNION ALL
SELECT 'storage', COUNT(*)
FROM storage s
WHERE s.user_id IN (SELECT id FROM tmp_quizzy_target)
UNION ALL
SELECT 'leaderboard_record', COUNT(*)
FROM leaderboard_record lr
WHERE lr.owner_id IN (SELECT id FROM tmp_quizzy_target)
UNION ALL
SELECT 'notification', COUNT(*)
FROM notification n
WHERE n.user_id IN (SELECT id FROM tmp_quizzy_target)
UNION ALL
SELECT 'notifications', COUNT(*)
FROM notifications n2
WHERE n2.user_id IN (SELECT id FROM tmp_quizzy_target)
UNION ALL
SELECT 'tournament_participants', COUNT(*)
FROM tournament_participants tp
WHERE tp.user_id IN (SELECT id FROM tmp_quizzy_target)
ORDER BY table_name;

\if :apply
\echo [purge] APPLY mode enabled. Creating backups in cleanup_backup schema...
SELECT 'CREATE SCHEMA IF NOT EXISTS cleanup_backup;' \gexec
SELECT format(
  'CREATE TABLE IF NOT EXISTS cleanup_backup.quizzy_users_%I AS
   SELECT * FROM users WHERE id IN (SELECT id FROM tmp_quizzy_target);',
  :'backup_suffix'
) \gexec
SELECT format(
  'CREATE TABLE IF NOT EXISTS cleanup_backup.quizzy_storage_%I AS
   SELECT * FROM storage WHERE user_id IN (SELECT id FROM tmp_quizzy_target);',
  :'backup_suffix'
) \gexec
SELECT format(
  'CREATE TABLE IF NOT EXISTS cleanup_backup.quizzy_leaderboard_record_%I AS
   SELECT * FROM leaderboard_record WHERE owner_id IN (SELECT id FROM tmp_quizzy_target);',
  :'backup_suffix'
) \gexec
SELECT format(
  'CREATE TABLE IF NOT EXISTS cleanup_backup.quizzy_notification_%I AS
   SELECT * FROM notification WHERE user_id IN (SELECT id FROM tmp_quizzy_target);',
  :'backup_suffix'
) \gexec
SELECT format(
  'CREATE TABLE IF NOT EXISTS cleanup_backup.quizzy_notifications_%I AS
   SELECT * FROM notifications WHERE user_id IN (SELECT id FROM tmp_quizzy_target);',
  :'backup_suffix'
) \gexec

\echo [purge] Deleting target data...
BEGIN;
DELETE FROM leaderboard_record
WHERE owner_id IN (SELECT id FROM tmp_quizzy_target);

DELETE FROM notifications
WHERE user_id IN (SELECT id FROM tmp_quizzy_target);

DELETE FROM users
WHERE id IN (SELECT id FROM tmp_quizzy_target);
COMMIT;

\echo [purge] Post-delete verification counts:
SELECT 'users' AS table_name, COUNT(*) AS rows
FROM users u
WHERE u.id IN (SELECT id FROM tmp_quizzy_target)
UNION ALL
SELECT 'storage', COUNT(*)
FROM storage s
WHERE s.user_id IN (SELECT id FROM tmp_quizzy_target)
UNION ALL
SELECT 'leaderboard_record', COUNT(*)
FROM leaderboard_record lr
WHERE lr.owner_id IN (SELECT id FROM tmp_quizzy_target)
UNION ALL
SELECT 'notification', COUNT(*)
FROM notification n
WHERE n.user_id IN (SELECT id FROM tmp_quizzy_target)
UNION ALL
SELECT 'notifications', COUNT(*)
FROM notifications n2
WHERE n2.user_id IN (SELECT id FROM tmp_quizzy_target)
ORDER BY table_name;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM users WHERE id IN (SELECT id FROM tmp_quizzy_target)) THEN
    RAISE EXCEPTION 'Verification failed: rows remain in users';
  END IF;
  IF EXISTS (SELECT 1 FROM storage WHERE user_id IN (SELECT id FROM tmp_quizzy_target)) THEN
    RAISE EXCEPTION 'Verification failed: rows remain in storage';
  END IF;
  IF EXISTS (SELECT 1 FROM leaderboard_record WHERE owner_id IN (SELECT id FROM tmp_quizzy_target)) THEN
    RAISE EXCEPTION 'Verification failed: rows remain in leaderboard_record';
  END IF;
  IF EXISTS (SELECT 1 FROM notification WHERE user_id IN (SELECT id FROM tmp_quizzy_target)) THEN
    RAISE EXCEPTION 'Verification failed: rows remain in notification';
  END IF;
  IF EXISTS (SELECT 1 FROM notifications WHERE user_id IN (SELECT id FROM tmp_quizzy_target)) THEN
    RAISE EXCEPTION 'Verification failed: rows remain in notifications';
  END IF;
END $$;

\echo [purge] Apply completed successfully.
\else
\echo [purge] DRY-RUN mode only. No rows were deleted.
\endif
