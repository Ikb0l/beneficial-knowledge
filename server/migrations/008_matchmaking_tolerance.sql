-- Set stricter matchmaking MMR tolerance and add MMR ceiling config

INSERT INTO game_config (config_key, config_value, description)
VALUES ('matchmaking_mmr_tolerance', '100', 'Max allowed MMR difference between client and stored MMR for matchmaking validation')
ON CONFLICT (config_key) DO UPDATE
SET config_value = EXCLUDED.config_value,
    description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO game_config (config_key, config_value, description)
VALUES ('mmr_ceiling', '10000', 'Maximum MMR ceiling (cannot go above this)')
ON CONFLICT (config_key) DO NOTHING;
