-- Expand notification types to cover tournament reminders and outcomes
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'notifications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%type%IN%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT ' || quote_ident(constraint_name);
    END IF;
END $$;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'notifications'::regclass
          AND conname = 'notifications_type_check'
    ) THEN
        ALTER TABLE notifications
            ADD CONSTRAINT notifications_type_check
            CHECK (type IN (
                'tournament_reminder', 'tournament_start', 'tournament_starting', 'tournament_result',
                'tournament_match_ready', 'match_result',
                'tournament_reminder_1h', 'tournament_reminder_15m',
                'tournament_ready_check', 'tournament_match_forfeit_win', 'tournament_match_forfeit_loss',
                'tournament_eliminated', 'tournament_victory', 'tournament_complete',
                'tournament_bracket_update',
                'friend_challenge', 'friend_request', 'friend_accepted',
                'challenge_accepted', 'challenge_declined', 'challenge_expired',
                'daily_reward', 'streak_reminder',
                'season_start', 'season_end', 'season_reward',
                'badge_earned', 'rank_up', 'rank_down',
                'donation_thanks', 'achievement',
                'category_new', 'online_threshold', 'tournament_new',
                'system', 'admin_message'
            ));
    END IF;
END $$;
