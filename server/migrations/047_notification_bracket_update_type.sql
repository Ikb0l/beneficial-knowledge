-- Add tournament_bracket_update to the notifications type check constraint.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type = ANY(ARRAY[
        'tournament_reminder','tournament_start','tournament_starting','tournament_result',
        'tournament_match_ready','match_result','tournament_reminder_1h','tournament_reminder_15m',
        'tournament_ready_check','tournament_match_forfeit_win','tournament_match_forfeit_loss',
        'tournament_eliminated','tournament_victory','tournament_complete',
        'tournament_bracket_update',
        'friend_challenge','friend_request','friend_accepted',
        'challenge_accepted','challenge_declined','challenge_expired',
        'daily_reward','streak_reminder','season_start','season_end','season_reward',
        'badge_earned','rank_up','rank_down','donation_thanks','achievement',
        'category_new','online_threshold','tournament_new','system','admin_message'
    ]::varchar[]));
