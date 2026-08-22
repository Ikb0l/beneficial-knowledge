BEGIN;

INSERT INTO game_config (config_key, config_value, description)
VALUES
(
  'flow_pacing_profiles',
  '{"rankedPreset":"balanced","practicePreset":"turbo","vocabPreset":"turbo"}'::jsonb,
  'Preset-based pacing for ranked/practice matches and vocabulary game UI transitions.'
)
ON CONFLICT (config_key) DO NOTHING;

COMMIT;
