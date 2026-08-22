-- Tournament schema verification
-- Run against the Nakama Postgres database.

-- Required columns
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='winner_id') AS tournaments_winner_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='completed_at') AS tournaments_completed_at,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='registered_count') AS tournaments_registered_count,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='seeding_mode') AS tournaments_seeding_mode,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='best_of_by_round') AS tournaments_best_of_by_round,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='grand_final_reset') AS tournaments_grand_final_reset,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournaments' AND column_name='bot_policy') AS tournaments_bot_policy,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_participants' AND column_name='eliminated_at') AS participants_eliminated_at,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_participants' AND column_name='is_bot') AS participants_is_bot,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_participants' AND column_name='bot_profile_id') AS participants_bot_profile_id,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_participants' AND column_name='bot_influenced') AS participants_bot_influenced,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='ready_player1') AS matches_ready_player1,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='ready_player2') AS matches_ready_player2,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='ready_at') AS matches_ready_at,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='forfeit_reason') AS matches_forfeit_reason,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='category') AS matches_category,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='best_of') AS matches_best_of,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='series_wins_player1') AS matches_series_wins_player1,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='series_wins_player2') AS matches_series_wins_player2,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='series_game_count') AS matches_series_game_count,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tournament_matches' AND column_name='last_activity_at') AS matches_last_activity_at,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tournament_reward_claims') AS tournament_reward_claims_table,
  EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='tournament_bot_profiles') AS tournament_bot_profiles_table;

-- Status constraints
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tournaments'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%IN%';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tournament_participants'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%IN%';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tournament_matches'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%IN%';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'notifications'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%type%IN%';

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tournaments'::regclass
  AND conname IN (
    'tournaments_status_check',
    'tournaments_schedule_window_check',
    'tournaments_registered_count_nonnegative_check',
    'tournaments_registered_count_capacity_check',
    'tournaments_seeding_mode_check'
  );

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tournament_matches'::regclass
  AND conname IN (
    'tournament_matches_best_of_check',
    'tournament_matches_series_values_check',
    'tournament_matches_distinct_players_check',
    'tournament_matches_winner_participant_check',
    'tournament_matches_player1_same_tournament_fkey',
    'tournament_matches_player2_same_tournament_fkey',
    'tournament_matches_winner_same_tournament_fkey'
  );

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'tournament_participants'::regclass
  AND conname IN (
    'tournament_participants_human_or_bot_check',
    'tournament_participants_bot_profile_fkey'
  );

-- Indexes
SELECT indexname FROM pg_indexes WHERE tablename='tournaments' AND indexname IN (
  'idx_tournaments_status',
  'idx_tournaments_registration',
  'idx_tournaments_completed',
  'tournaments_winner_id_idx'
);

SELECT indexname FROM pg_indexes WHERE tablename='tournament_participants' AND indexname IN (
  'idx_tournament_participants_tournament',
  'idx_tournament_participants_user',
  'idx_tournament_participants_eliminated',
  'uq_tournament_participants_id_tournament',
  'idx_tournament_participants_tournament_bot',
  'idx_tournament_participants_bot_profile'
);

SELECT indexname FROM pg_indexes WHERE tablename='tournament_bot_profiles' AND indexname IN (
  'idx_tournament_bot_profiles_active'
);

SELECT indexname FROM pg_indexes WHERE tablename='tournament_matches' AND indexname IN (
  'idx_tournament_matches_tournament_round',
  'idx_tournament_matches_status',
  'idx_tournament_matches_last_activity',
  'uq_tournament_matches_slot'
);

SELECT indexname FROM pg_indexes WHERE tablename='notifications' AND indexname IN (
  'idx_notifications_tournament_event_unique',
  'idx_notifications_tournament_reminder_unique'
);

-- Trigger/function checks
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'tournament_participants'::regclass
  AND tgname = 'trg_sync_tournament_registered_count';

SELECT proname
FROM pg_proc
WHERE proname = 'sync_tournament_registered_count';

SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'tournament_matches'::regclass
  AND tgname = 'trg_touch_tournament_match_activity';

SELECT proname
FROM pg_proc
WHERE proname = 'touch_tournament_match_activity';

-- Bot policy config keys
SELECT config_key
FROM game_config
WHERE config_key IN ('bot_tournament_default_policy', 'bot_tournament_difficulty_profile')
ORDER BY config_key;

-- Reminder duplication sanity check (should be zero rows)
SELECT
  user_id,
  type,
  data->>'tournamentId' AS tournament_id,
  COUNT(*) AS duplicate_count
FROM notifications
WHERE type IN ('tournament_reminder_1h', 'tournament_reminder_15m')
GROUP BY user_id, type, data->>'tournamentId'
HAVING COUNT(*) > 1;
