-- ============================================================================
-- TELEGRAM STARS DONATION BADGES
-- ============================================================================

-- Add Telegram Stars donation badges
INSERT INTO badges (badge_key, name, description, rarity, category, is_title, icon_url) VALUES
    ('supporter', 'Supporter', 'Donated 250+ Stars to support the app', 'rare', 'donation', false, 'emoji:💚'),
    ('patron', 'Patron', 'Donated 500+ Stars - a generous contribution', 'epic', 'donation', false, 'emoji:💙'),
    ('champion', 'Champion', 'Donated 1250+ Stars - true dedication', 'legendary', 'donation', true, 'emoji:💜'),
    ('legend', 'Legend', 'Donated 2500+ Stars - legendary support!', 'mythic', 'donation', true, 'emoji:💛')
ON CONFLICT (badge_key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    rarity = EXCLUDED.rarity,
    icon_url = EXCLUDED.icon_url;

-- Update donation_tiers to match Telegram Stars pricing
-- Note: amount_cents field is repurposed as stars amount for XTR currency
DELETE FROM donation_tiers dt
USING donation_tiers dupe
WHERE dt.tier_name = dupe.tier_name
  AND dt.ctid < dupe.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS idx_donation_tiers_tier_name_unique
ON donation_tiers(tier_name);

INSERT INTO donation_tiers (tier_name, min_amount_cents, badge_id, coins_bonus, is_active) VALUES
    ('Supporter', 250, (SELECT id FROM badges WHERE badge_key = 'supporter'), 500, true),
    ('Patron', 500, (SELECT id FROM badges WHERE badge_key = 'patron'), 1200, true),
    ('Champion', 1250, (SELECT id FROM badges WHERE badge_key = 'champion'), 3500, true),
    ('Legend', 2500, (SELECT id FROM badges WHERE badge_key = 'legend'), 8000, true)
ON CONFLICT (tier_name) DO UPDATE SET
    min_amount_cents = EXCLUDED.min_amount_cents,
    badge_id = EXCLUDED.badge_id,
    coins_bonus = EXCLUDED.coins_bonus,
    is_active = EXCLUDED.is_active;
