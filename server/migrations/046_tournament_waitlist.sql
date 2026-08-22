-- Tournament Waitlist
-- - Players can join a waitlist when a tournament is full.
-- - When someone withdraws or is disqualified before the tournament starts,
--   the first waitlisted player is automatically promoted.
-- - Waitlist is automatically cleared when the tournament starts.

CREATE TABLE IF NOT EXISTS tournament_waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    mmr_at_join INTEGER NOT NULL DEFAULT 1000,
    position INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'promoted', 'withdrawn', 'expired')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    promoted_at TIMESTAMPTZ,
    UNIQUE (tournament_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tournament_waitlist_pending
    ON tournament_waitlist(tournament_id, position)
    WHERE status = 'waiting';

-- Function to auto-promote the first waitlisted player
CREATE OR REPLACE FUNCTION promote_first_waitlisted()
RETURNS trigger AS $$
DECLARE
    first_user_id UUID;
    first_mmr INTEGER;
    waitlist_id UUID;
BEGIN
    -- Only promote when a participant is deleted AND the tournament
    -- is still in registration/upcoming status.
    IF TG_OP = 'DELETE' THEN
        SELECT tw.id, tw.user_id, tw.mmr_at_join
        INTO waitlist_id, first_user_id, first_mmr
        FROM tournament_waitlist tw
        JOIN tournaments t ON t.id = tw.tournament_id
        WHERE tw.tournament_id = OLD.tournament_id
          AND tw.status = 'waiting'
          AND t.status IN ('registration', 'upcoming')
        ORDER BY tw.position ASC
        LIMIT 1
        FOR UPDATE OF tw SKIP LOCKED;

        IF first_user_id IS NOT NULL THEN
            -- Promote the user
            UPDATE tournament_waitlist
            SET status = 'promoted', promoted_at = NOW()
            WHERE id = waitlist_id;

            -- Insert as participant
            INSERT INTO tournament_participants (tournament_id, user_id, mmr_at_registration)
            VALUES (OLD.tournament_id, first_user_id, first_mmr)
            ON CONFLICT (tournament_id, user_id) DO NOTHING;

            -- Bump remaining positions
            UPDATE tournament_waitlist
            SET position = position - 1
            WHERE tournament_id = OLD.tournament_id
              AND status = 'waiting'
              AND position > 0;
        END IF;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_promote_from_waitlist ON tournament_participants;
CREATE TRIGGER trg_auto_promote_from_waitlist
AFTER DELETE ON tournament_participants
FOR EACH ROW
EXECUTE FUNCTION promote_first_waitlisted();
