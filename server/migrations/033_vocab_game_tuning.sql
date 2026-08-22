BEGIN;

INSERT INTO game_config (config_key, config_value, description)
VALUES
(
  'vocab_game_tuning',
  '{}'::jsonb,
  'Per-mode tuning for vocabulary games (timer, scoring, time budget, adaptive difficulty).'
)
ON CONFLICT (config_key) DO NOTHING;

COMMIT;
