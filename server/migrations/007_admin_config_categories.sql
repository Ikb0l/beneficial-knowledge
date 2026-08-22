-- ============================================================================
-- Admin Configuration, Rank Tiers, Categories, and Home Page Control
-- Migration adds tables for configurable rank tiers, dynamic categories,
-- and home page management (banners, featured items, sections)
-- ============================================================================

-- ============================================================================
-- RANK TIERS TABLE
-- Configurable rank tiers for display based on MMR ranges
-- ============================================================================

CREATE TABLE IF NOT EXISTS rank_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_key VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    min_mmr INTEGER NOT NULL,
    max_mmr INTEGER NOT NULL,
    icon_url VARCHAR(500),
    color VARCHAR(20),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default rank tiers (migrated from hardcoded RANK_TIERS)
INSERT INTO rank_tiers (tier_key, name, min_mmr, max_mmr, color, display_order) VALUES
    ('bronze', 'Bronze', 0, 1099, '#CD7F32', 1),
    ('silver', 'Silver', 1100, 1299, '#C0C0C0', 2),
    ('gold', 'Gold', 1300, 1499, '#FFD700', 3),
    ('platinum', 'Platinum', 1500, 1699, '#E5E4E2', 4),
    ('diamond', 'Diamond', 1700, 1899, '#B9F2FF', 5),
    ('master', 'Master', 1900, 2099, '#9966CC', 6),
    ('grandmaster', 'Grandmaster', 2100, 99999, '#FF4500', 7)
ON CONFLICT (tier_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_rank_tiers_mmr ON rank_tiers(min_mmr, max_mmr) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_rank_tiers_order ON rank_tiers(display_order) WHERE is_active = true;

-- ============================================================================
-- CATEGORIES TABLE
-- Dynamic categories replacing hardcoded enum
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_key VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon VARCHAR(50),  -- emoji or icon name
    icon_url VARCHAR(500),
    parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    min_questions_required INTEGER DEFAULT 10,
    questions_per_match INTEGER DEFAULT 7,
    time_per_question INTEGER DEFAULT 15,  -- seconds
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Categories are now created via admin dashboard - no seed data
-- Create your own categories after setting up the app

CREATE INDEX IF NOT EXISTS idx_categories_active ON categories(is_active, display_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_key ON categories(category_key);

-- ============================================================================
-- ADD CATEGORY_ID TO QUESTIONS TABLE
-- Foreign key reference to categories table
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'questions' AND column_name = 'category_id'
    ) THEN
        ALTER TABLE questions ADD COLUMN category_id UUID REFERENCES categories(id);
    END IF;
END $$;

-- Migrate existing questions to use category_id
UPDATE questions q
SET category_id = c.id
FROM categories c
WHERE q.category = c.category_key
AND q.category_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_category_id ON questions(category_id) WHERE is_active = true;

-- ============================================================================
-- HOME BANNERS TABLE
-- Announcement banners for home page
-- ============================================================================

CREATE TABLE IF NOT EXISTS home_banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    body TEXT,
    image_url VARCHAR(500),
    action_url VARCHAR(500),
    action_type VARCHAR(50) DEFAULT 'url' CHECK (action_type IN ('url', 'category', 'tournament', 'screen')),
    action_data JSONB,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_home_banners_active ON home_banners(is_active, display_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_home_banners_dates ON home_banners(start_date, end_date) WHERE is_active = true;

-- ============================================================================
-- HOME SECTIONS TABLE
-- Home page section ordering and visibility
-- ============================================================================

CREATE TABLE IF NOT EXISTS home_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_key VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_visible BOOLEAN DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    config JSONB DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default home sections
INSERT INTO home_sections (section_key, name, display_order) VALUES
    ('banners', 'Announcement Banners', 1),
    ('featured_categories', 'Featured Categories', 2),
    ('quick_match', 'Quick Match', 3),
    ('featured_tournaments', 'Featured Tournaments', 4),
    ('leaderboard_preview', 'Leaderboard Preview', 5),
    ('daily_challenge', 'Daily Challenge', 6)
ON CONFLICT (section_key) DO NOTHING;

-- ============================================================================
-- FEATURED ITEMS TABLE
-- Featured categories and tournaments for home page
-- ============================================================================

CREATE TABLE IF NOT EXISTS featured_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_type VARCHAR(50) NOT NULL CHECK (item_type IN ('category', 'tournament')),
    item_id UUID NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_featured_items_type ON featured_items(item_type, is_active, display_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_featured_items_dates ON featured_items(start_date, end_date) WHERE is_active = true;

-- ============================================================================
-- MMR CONFIGURATION - Add to game_config
-- ============================================================================

INSERT INTO game_config (config_key, config_value, description) VALUES
    ('mmr_starting', '1000', 'Starting MMR for new players'),
    ('mmr_calibration_matches', '10', 'Number of calibration matches before fixed MMR gains'),
    ('mmr_win_gain', '25', 'MMR gained on win (post-calibration)'),
    ('mmr_loss_penalty', '25', 'MMR lost on loss (post-calibration)'),
    ('mmr_floor', '0', 'Minimum MMR floor (cannot go below this)')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- MATCHMAKING CONFIGURATION - Add to game_config
-- ============================================================================

INSERT INTO game_config (config_key, config_value, description) VALUES
    ('matchmaking_initial_range', '100', 'Initial MMR range for matchmaking'),
    ('matchmaking_expansion_rate', '10', 'MMR range expansion per interval'),
    ('matchmaking_max_range', '500', 'Maximum MMR range for matchmaking'),
    ('matchmaking_expansion_interval', '5', 'Seconds between range expansions')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get rank tier for a given MMR
CREATE OR REPLACE FUNCTION get_rank_tier(p_mmr INTEGER)
RETURNS TABLE(tier_key VARCHAR, name VARCHAR, color VARCHAR, icon_url VARCHAR) AS $$
BEGIN
    RETURN QUERY
    SELECT rt.tier_key, rt.name, rt.color, rt.icon_url
    FROM rank_tiers rt
    WHERE rt.is_active = true
    AND p_mmr >= rt.min_mmr
    AND p_mmr <= rt.max_mmr
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function to get active banners (for client)
CREATE OR REPLACE FUNCTION get_active_banners()
RETURNS SETOF home_banners AS $$
BEGIN
    RETURN QUERY
    SELECT *
    FROM home_banners
    WHERE is_active = true
    AND (start_date IS NULL OR start_date <= NOW())
    AND (end_date IS NULL OR end_date >= NOW())
    ORDER BY display_order ASC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE rank_tiers IS 'Configurable rank tiers for display based on MMR ranges (visual only)';
COMMENT ON TABLE categories IS 'Dynamic quiz categories with per-category settings';
COMMENT ON TABLE home_banners IS 'Announcement banners for home page with scheduling';
COMMENT ON TABLE home_sections IS 'Home page section ordering and visibility configuration';
COMMENT ON TABLE featured_items IS 'Featured categories and tournaments for home page';
