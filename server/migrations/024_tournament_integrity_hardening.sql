-- Tournament integrity hardening
-- - status/check consistency
-- - capacity counter maintenance
-- - strict bracket identity constraints
-- - same-tournament participant integrity
-- - reward idempotency support
-- - safer notification dedupe keying

-- Rebuild tournaments status check (handles unnamed legacy constraints).
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'tournaments'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%status%IN%'
    LOOP
        EXECUTE 'ALTER TABLE tournaments DROP CONSTRAINT ' || quote_ident(c.conname);
    END LOOP;
END $$;

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check;
ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_status_check
    CHECK (status IN ('upcoming', 'registration', 'in_progress', 'paused', 'completed', 'cancelled'));

-- Reward grant claims (idempotency ledger for tournament rewards).
CREATE TABLE IF NOT EXISTS tournament_reward_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    reward_key VARCHAR(32) NOT NULL,
    reward_type VARCHAR(32) NOT NULL CHECK (reward_type IN ('coins', 'badge', 'mmr_bonus')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tournament_id, user_id, reward_key, reward_type)
);

CREATE INDEX IF NOT EXISTS idx_tournament_reward_claims_tournament
    ON tournament_reward_claims(tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_reward_claims_user
    ON tournament_reward_claims(user_id);

-- Ensure registered_count exists and is backfilled.
ALTER TABLE tournaments
    ADD COLUMN IF NOT EXISTS registered_count INTEGER DEFAULT 0;

UPDATE tournaments t
SET registered_count = COALESCE((
    SELECT COUNT(*)::int
    FROM tournament_participants tp
    WHERE tp.tournament_id = t.id
), 0);

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_registered_count_nonnegative_check;
ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_registered_count_nonnegative_check
    CHECK (registered_count >= 0);

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_registered_count_capacity_check;
ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_registered_count_capacity_check
    CHECK (registered_count <= bracket_size)
    NOT VALID;

-- Keep tournaments.registered_count synchronized with participant row changes.
CREATE OR REPLACE FUNCTION sync_tournament_registered_count() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tournaments
        SET registered_count = COALESCE((
            SELECT COUNT(*)::int
            FROM tournament_participants
            WHERE tournament_id = NEW.tournament_id
        ), 0)
        WHERE id = NEW.tournament_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tournaments
        SET registered_count = COALESCE((
            SELECT COUNT(*)::int
            FROM tournament_participants
            WHERE tournament_id = OLD.tournament_id
        ), 0)
        WHERE id = OLD.tournament_id;
        RETURN OLD;
    END IF;

    IF NEW.tournament_id IS DISTINCT FROM OLD.tournament_id THEN
        UPDATE tournaments
        SET registered_count = COALESCE((
            SELECT COUNT(*)::int
            FROM tournament_participants
            WHERE tournament_id = OLD.tournament_id
        ), 0)
        WHERE id = OLD.tournament_id;
    END IF;

    UPDATE tournaments
    SET registered_count = COALESCE((
        SELECT COUNT(*)::int
        FROM tournament_participants
        WHERE tournament_id = NEW.tournament_id
    ), 0)
    WHERE id = NEW.tournament_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_tournament_registered_count ON tournament_participants;
CREATE TRIGGER trg_sync_tournament_registered_count
AFTER INSERT OR DELETE OR UPDATE OF tournament_id
ON tournament_participants
FOR EACH ROW
EXECUTE FUNCTION sync_tournament_registered_count();

-- Keep last_activity_at updated for in-progress matches at DB level.
CREATE OR REPLACE FUNCTION touch_tournament_match_activity() RETURNS trigger AS $$
BEGIN
    IF NEW.status = 'in_progress' THEN
        NEW.last_activity_at = NOW();
    ELSIF TG_OP = 'INSERT' AND NEW.last_activity_at IS NULL THEN
        NEW.last_activity_at = COALESCE(NEW.started_at, NEW.created_at, NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_touch_tournament_match_activity ON tournament_matches;
CREATE TRIGGER trg_touch_tournament_match_activity
BEFORE INSERT OR UPDATE OF status, nakama_match_id, ready_player1, ready_player2, player1_score, player2_score, series_game_count
ON tournament_matches
FOR EACH ROW
EXECUTE FUNCTION touch_tournament_match_activity();

-- Schedule integrity guards.
UPDATE tournaments
SET registration_end = registration_start + INTERVAL '1 minute'
WHERE registration_end <= registration_start;

UPDATE tournaments
SET tournament_start = registration_end + INTERVAL '1 minute'
WHERE tournament_start < registration_end;

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_schedule_window_check;
ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_schedule_window_check
    CHECK (registration_start < registration_end AND registration_end <= tournament_start)
    NOT VALID;

-- Seeding/series value hardening.
UPDATE tournaments
SET seeding_mode = 'mmr'
WHERE seeding_mode IS NULL
   OR seeding_mode NOT IN ('mmr', 'random_opening_round', 'manual');

ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_seeding_mode_check;
ALTER TABLE tournaments
    ADD CONSTRAINT tournaments_seeding_mode_check
    CHECK (seeding_mode IN ('mmr', 'random_opening_round', 'manual'));

UPDATE tournament_matches
SET best_of = CASE WHEN best_of IN (1, 3, 5) THEN best_of ELSE 1 END,
    series_wins_player1 = GREATEST(COALESCE(series_wins_player1, 0), 0),
    series_wins_player2 = GREATEST(COALESCE(series_wins_player2, 0), 0),
    series_game_count = GREATEST(COALESCE(series_game_count, 0), 0);

UPDATE tournament_matches
SET series_wins_player1 = LEAST(series_wins_player1, best_of),
    series_wins_player2 = LEAST(series_wins_player2, best_of),
    series_game_count = LEAST(series_game_count, best_of);

ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_best_of_check;
ALTER TABLE tournament_matches
    ADD CONSTRAINT tournament_matches_best_of_check
    CHECK (best_of IN (1, 3, 5));

ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_series_values_check;
ALTER TABLE tournament_matches
    ADD CONSTRAINT tournament_matches_series_values_check
    CHECK (
        series_wins_player1 >= 0
        AND series_wins_player2 >= 0
        AND series_game_count >= 0
        AND series_wins_player1 <= best_of
        AND series_wins_player2 <= best_of
        AND series_game_count <= best_of
    )
    NOT VALID;

-- Normalize invalid participant references before strict same-tournament FKs.
UPDATE tournament_matches tm
SET player1_participant_id = NULL
WHERE player1_participant_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM tournament_participants tp
      WHERE tp.id = tm.player1_participant_id
        AND tp.tournament_id = tm.tournament_id
  );

UPDATE tournament_matches tm
SET player2_participant_id = NULL
WHERE player2_participant_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM tournament_participants tp
      WHERE tp.id = tm.player2_participant_id
        AND tp.tournament_id = tm.tournament_id
  );

UPDATE tournament_matches tm
SET winner_participant_id = NULL
WHERE winner_participant_id IS NOT NULL
  AND (
      NOT EXISTS (
          SELECT 1
          FROM tournament_participants tp
          WHERE tp.id = tm.winner_participant_id
            AND tp.tournament_id = tm.tournament_id
      )
      OR (
          tm.winner_participant_id IS DISTINCT FROM tm.player1_participant_id
          AND tm.winner_participant_id IS DISTINCT FROM tm.player2_participant_id
      )
  );

-- De-duplicate match slots before enforcing uniqueness.
WITH ranked AS (
    SELECT
        id,
        tournament_id,
        round_number,
        match_number,
        bracket_type,
        ROW_NUMBER() OVER (
            PARTITION BY tournament_id, round_number, match_number, bracket_type
            ORDER BY
                CASE status
                    WHEN 'completed' THEN 5
                    WHEN 'in_progress' THEN 4
                    WHEN 'ready' THEN 3
                    WHEN 'pending' THEN 2
                    WHEN 'bye' THEN 1
                    ELSE 0
                END DESC,
                completed_at DESC NULLS LAST,
                started_at DESC NULLS LAST,
                created_at DESC,
                id DESC
        ) AS rn
    FROM tournament_matches
),
mapping AS (
    SELECT d.id AS duplicate_id, k.id AS keep_id
    FROM ranked d
    JOIN ranked k
      ON k.tournament_id = d.tournament_id
     AND k.round_number = d.round_number
     AND k.match_number = d.match_number
     AND k.bracket_type = d.bracket_type
     AND k.rn = 1
    WHERE d.rn > 1
),
rewired AS (
    UPDATE tournament_matches tm
    SET next_match_id = m.keep_id
    FROM mapping m
    WHERE tm.next_match_id = m.duplicate_id
    RETURNING tm.id
)
DELETE FROM tournament_matches tm
USING mapping m
WHERE tm.id = m.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_matches_slot
    ON tournament_matches(tournament_id, round_number, match_number, bracket_type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_participants_id_tournament
    ON tournament_participants(id, tournament_id);

-- Replace per-column participant FKs with same-tournament composite FKs.
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_player1_participant_id_fkey;
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_player2_participant_id_fkey;
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_winner_participant_id_fkey;

ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_player1_same_tournament_fkey;
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_player2_same_tournament_fkey;
ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_winner_same_tournament_fkey;

ALTER TABLE tournament_matches
    ADD CONSTRAINT tournament_matches_player1_same_tournament_fkey
    FOREIGN KEY (player1_participant_id, tournament_id)
    REFERENCES tournament_participants(id, tournament_id)
    ON DELETE SET NULL;

ALTER TABLE tournament_matches
    ADD CONSTRAINT tournament_matches_player2_same_tournament_fkey
    FOREIGN KEY (player2_participant_id, tournament_id)
    REFERENCES tournament_participants(id, tournament_id)
    ON DELETE SET NULL;

ALTER TABLE tournament_matches
    ADD CONSTRAINT tournament_matches_winner_same_tournament_fkey
    FOREIGN KEY (winner_participant_id, tournament_id)
    REFERENCES tournament_participants(id, tournament_id)
    ON DELETE SET NULL;

ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_distinct_players_check;
ALTER TABLE tournament_matches
    ADD CONSTRAINT tournament_matches_distinct_players_check
    CHECK (
        player1_participant_id IS NULL
        OR player2_participant_id IS NULL
        OR player1_participant_id <> player2_participant_id
    );

ALTER TABLE tournament_matches DROP CONSTRAINT IF EXISTS tournament_matches_winner_participant_check;
ALTER TABLE tournament_matches
    ADD CONSTRAINT tournament_matches_winner_participant_check
    CHECK (
        winner_participant_id IS NULL
        OR winner_participant_id = player1_participant_id
        OR winner_participant_id = player2_participant_id
    );

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') THEN
        UPDATE tournaments t
        SET winner_id = NULL
        WHERE winner_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = t.winner_id);

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = 'tournaments'::regclass
              AND conname = 'tournaments_winner_user_fkey'
        ) THEN
            ALTER TABLE tournaments
                ADD CONSTRAINT tournaments_winner_user_fkey
                FOREIGN KEY (winner_id)
                REFERENCES users(id)
                ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

-- Replace tournament event dedupe index to avoid over-collapsing events missing IDs.
DROP INDEX IF EXISTS idx_notifications_tournament_event_unique;

WITH ranked AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY
                user_id,
                type,
                NULLIF(data->>'tournamentId', ''),
                COALESCE(NULLIF(data->>'matchId', ''), '#')
            ORDER BY created_at DESC, id DESC
        ) AS rn
    FROM notifications
    WHERE type IN (
        'tournament_match_ready',
        'tournament_ready_check',
        'tournament_match_forfeit_win',
        'tournament_match_forfeit_loss',
        'tournament_eliminated',
        'tournament_victory',
        'tournament_complete'
    )
      AND (data ? 'tournamentId')
)
DELETE FROM notifications n
USING ranked r
WHERE n.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_tournament_event_unique
ON notifications (
    user_id,
    type,
    NULLIF(data->>'tournamentId', ''),
    COALESCE(NULLIF(data->>'matchId', ''), '#')
)
WHERE type IN (
    'tournament_match_ready',
    'tournament_ready_check',
    'tournament_match_forfeit_win',
    'tournament_match_forfeit_loss',
    'tournament_eliminated',
    'tournament_victory',
    'tournament_complete'
)
  AND (data ? 'tournamentId');
