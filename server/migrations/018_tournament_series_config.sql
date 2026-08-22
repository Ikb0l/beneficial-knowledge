-- Tournament series config + seeding mode

-- Tournaments: add seeding mode, per-round best-of config, and grand final reset toggle
ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS seeding_mode VARCHAR(50) DEFAULT 'mmr';

ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS best_of_by_round JSONB DEFAULT '{}'::jsonb;

ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS grand_final_reset BOOLEAN DEFAULT false;

-- Tournament matches: series tracking
ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS best_of INTEGER DEFAULT 1;

ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS series_wins_player1 INTEGER DEFAULT 0;

ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS series_wins_player2 INTEGER DEFAULT 0;

ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS series_game_count INTEGER DEFAULT 0;

-- Backfill existing rows
UPDATE tournaments
SET seeding_mode = COALESCE(seeding_mode, 'mmr')
WHERE seeding_mode IS NULL;

UPDATE tournaments
SET best_of_by_round = COALESCE(best_of_by_round, '{}'::jsonb)
WHERE best_of_by_round IS NULL;

UPDATE tournaments
SET grand_final_reset = COALESCE(grand_final_reset, false)
WHERE grand_final_reset IS NULL;

UPDATE tournament_matches
SET best_of = COALESCE(best_of, 1),
    series_wins_player1 = COALESCE(series_wins_player1, 0),
    series_wins_player2 = COALESCE(series_wins_player2, 0),
    series_game_count = COALESCE(series_game_count, 0)
WHERE best_of IS NULL
   OR series_wins_player1 IS NULL
   OR series_wins_player2 IS NULL
   OR series_game_count IS NULL;

