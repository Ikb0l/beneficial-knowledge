-- Integrity fixes: pending challenge uniqueness + Telegram Stars payment replay prevention

-- Align pending_challenges.status type and allowed values.
ALTER TABLE pending_challenges
  ALTER COLUMN status TYPE VARCHAR(30);

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'pending_challenges'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE pending_challenges DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

ALTER TABLE pending_challenges
  ADD CONSTRAINT pending_challenges_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'auto_declined', 'expired_challenger_busy'));

-- Remove overly strict historical unique constraint that blocked repeat accepted rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'pending_challenges'::regclass
      AND contype = 'u'
      AND conname = 'pending_challenges_challenger_id_challenged_id_status_key'
  ) THEN
    ALTER TABLE pending_challenges
      DROP CONSTRAINT pending_challenges_challenger_id_challenged_id_status_key;
  END IF;
END $$;

-- Only one active pending challenge per pair (direction-agnostic).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pending_challenges_pair_pending
ON pending_challenges (
  LEAST(challenger_id::text, challenged_id::text),
  GREATEST(challenger_id::text, challenged_id::text)
)
WHERE status = 'pending';

-- Prevent Telegram Stars payment transaction replay across donations.
CREATE UNIQUE INDEX IF NOT EXISTS idx_donations_telegram_payment_id_unique
ON donations (payment_provider, payment_id)
WHERE payment_provider = 'telegram_stars' AND payment_id IS NOT NULL;
