-- Add tournament creation campaign notifications.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

DO $$
BEGIN
  ALTER TABLE notifications
    ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
      'tournament_reminder', 'tournament_start', 'tournament_starting', 'tournament_result',
      'tournament_match_ready', 'match_result', 'tournament_reminder_1h', 'tournament_reminder_15m',
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
EXCEPTION WHEN duplicate_object THEN
  -- Constraint exists on some environments after repeated applies.
  NULL;
END $$;

ALTER TABLE notification_campaigns DROP CONSTRAINT IF EXISTS notification_campaigns_campaign_type_check;

ALTER TABLE notification_campaigns
  ADD CONSTRAINT notification_campaigns_campaign_type_check
  CHECK (campaign_type IN ('category_new', 'online_threshold', 'tournament_new'));

DROP INDEX IF EXISTS idx_notifications_campaign_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_campaign_dedupe
  ON notifications(user_id, type, ((data->>'campaignId')))
  WHERE type IN ('category_new', 'online_threshold', 'tournament_new')
    AND (data ? 'campaignId');
