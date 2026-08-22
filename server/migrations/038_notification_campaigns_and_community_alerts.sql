-- Notification campaigns, community alerts, and expanded notification types.

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
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS notification_campaigns (
  id UUID PRIMARY KEY,
  campaign_type VARCHAR(50) NOT NULL CHECK (campaign_type IN ('category_new', 'online_threshold', 'tournament_new')),
  dedupe_key VARCHAR(200) NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_url TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  cursor_user_id UUID,
  sent_in_app_count INTEGER NOT NULL DEFAULT 0,
  sent_telegram_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_type, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_campaigns_status_created
  ON notification_campaigns(status, created_at ASC);

CREATE TABLE IF NOT EXISTS community_alert_state (
  state_key VARCHAR(100) PRIMARY KEY,
  is_above_threshold BOOLEAN NOT NULL DEFAULT false,
  last_count INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO community_alert_state (state_key, is_above_threshold, last_count)
VALUES ('online_threshold', false, 0)
ON CONFLICT (state_key) DO NOTHING;

INSERT INTO game_config (config_key, config_value, updated_at)
VALUES
  ('community_online_threshold', to_jsonb(2), NOW()),
  ('community_online_cooldown_minutes', to_jsonb(60), NOW()),
  ('community_alerts_enabled', to_jsonb(true), NOW()),
  ('community_dispatch_batch_size', to_jsonb(200), NOW()),
  ('telegram_dispatch_per_run', to_jsonb(25), NOW()),
  ('telegram_miniapp_deeplink_base', to_jsonb(''::text), NOW())
ON CONFLICT (config_key) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_campaign_dedupe
  ON notifications(user_id, type, ((data->>'campaignId')))
  WHERE type IN ('category_new', 'online_threshold', 'tournament_new')
    AND (data ? 'campaignId');
