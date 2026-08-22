-- Add tournament pause status and ready-check fields

-- Update tournaments status check to include 'paused'
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'tournaments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%IN%';

    IF constraint_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE tournaments DROP CONSTRAINT ' || quote_ident(constraint_name);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'tournaments'::regclass
          AND conname = 'tournaments_status_check'
    ) THEN
        ALTER TABLE tournaments
            ADD CONSTRAINT tournaments_status_check
            CHECK (status IN ('upcoming', 'registration', 'in_progress', 'paused', 'completed', 'cancelled'));
    END IF;
END $$;

-- Add ready-check columns for tournament matches
ALTER TABLE tournament_matches
    ADD COLUMN IF NOT EXISTS ready_player1 BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS ready_player2 BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS ready_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS forfeit_reason VARCHAR(50);
