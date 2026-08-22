-- Remove deprecated standalone vocabulary games feature and related config.

DROP TABLE IF EXISTS vocab_game_user_item_state;
DROP TABLE IF EXISTS vocab_game_attempts;
DROP TABLE IF EXISTS vocab_game_sessions;
DROP TABLE IF EXISTS vocab_game_items;

DELETE FROM game_config
WHERE config_key = 'vocab_game_tuning';

UPDATE game_config
SET
  config_value = jsonb_build_object(
    'rankedPreset',
      CASE LOWER(COALESCE(config_value->>'rankedPreset', ''))
        WHEN 'classic' THEN 'classic'
        WHEN 'balanced' THEN 'balanced'
        WHEN 'turbo' THEN 'turbo'
        ELSE 'balanced'
      END,
    'practicePreset',
      CASE LOWER(COALESCE(config_value->>'practicePreset', ''))
        WHEN 'classic' THEN 'classic'
        WHEN 'fast' THEN 'fast'
        WHEN 'turbo' THEN 'turbo'
        ELSE 'turbo'
      END
  ),
  updated_at = NOW()
WHERE config_key = 'flow_pacing_profiles';
