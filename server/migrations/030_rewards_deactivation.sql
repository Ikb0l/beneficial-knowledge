-- Non-destructive reward deactivation.
-- Keep historical data/tables for rollback, but disable active reward artifacts.

-- Disable all badge catalog entries so no new badge awards can occur accidentally.
UPDATE badges
SET is_active = false
WHERE is_active = true;

-- Disable donation-tier reward payloads while retaining tier rows.
UPDATE donation_tiers
SET badge_id = NULL,
    coins_bonus = 0
WHERE badge_id IS NOT NULL
   OR COALESCE(coins_bonus, 0) <> 0;
