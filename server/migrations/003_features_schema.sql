-- Quiz Battle Features Schema Migration
-- Adds tables for game config, seasons, tournaments, rewards, notifications, analytics, donations
-- Also includes future-proofing schemas for teams/clans, power-ups, and multi-language

-- ============================================================================
-- GAME CONFIGURATION
-- ============================================================================

-- Game settings (question counts, modes, timers)
CREATE TABLE IF NOT EXISTS game_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    description TEXT,
    updated_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default configurations
INSERT INTO game_config (config_key, config_value, description) VALUES
    ('question_counts', '{"default": 10, "quick": 5, "standard": 10, "marathon": 20}', 'Question counts for different game modes'),
    ('category_question_counts', '{}', 'Override question counts per category'),
    ('time_per_question_ms', '15000', 'Time limit per question in milliseconds'),
    ('reveal_delay_ms', '3000', 'Delay between questions for answer reveal'),
    ('matchmaking_timeout_ms', '30000', 'Matchmaking timeout before bot match'),
    ('bot_enabled', 'true', 'Enable bot matches when no opponent found'),
    ('daily_coin_reward', '50', 'Base daily login reward coins'),
    ('streak_bonus_multiplier', '1.5', 'Multiplier for daily streak bonus'),
    ('match_win_coins', '25', 'Coins awarded for winning a match'),
    ('match_participation_coins', '5', 'Coins awarded for match participation')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- SEASONS SYSTEM
-- ============================================================================

-- Seasons table
CREATE TABLE IF NOT EXISTS seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_number INTEGER NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT false,
    rewards_distributed BOOLEAN DEFAULT false,
    reward_config JSONB NOT NULL DEFAULT '{
        "grandmaster": {"min_rank": 1, "max_rank": 1, "coins": 5000, "badge": "season_grandmaster"},
        "master": {"min_rank": 2, "max_rank": 10, "coins": 2500, "badge": "season_master"},
        "diamond": {"min_rank": 11, "max_rank": 50, "coins": 1000, "badge": "season_diamond"},
        "platinum": {"min_rank": 51, "max_rank": 100, "coins": 500, "badge": "season_platinum"},
        "gold": {"min_rank": 101, "max_rank": 500, "coins": 250, "badge": "season_gold"},
        "participant": {"min_games": 10, "coins": 50, "badge": "season_participant"}
    }',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Season rankings (separate from all-time rankings)
CREATE TABLE IF NOT EXISTS season_rankings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    mmr INTEGER NOT NULL DEFAULT 1000,
    peak_mmr INTEGER NOT NULL DEFAULT 1000,
    games_played INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    final_rank INTEGER,
    reward_tier VARCHAR(50),
    rewards_claimed BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(season_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_seasons_active ON seasons(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_seasons_dates ON seasons(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_season_rankings_mmr ON season_rankings(season_id, mmr DESC);
CREATE INDEX IF NOT EXISTS idx_season_rankings_user ON season_rankings(user_id, season_id DESC);

-- ============================================================================
-- TOURNAMENTS SYSTEM
-- ============================================================================

-- Tournaments table
CREATE TABLE IF NOT EXISTS tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    format VARCHAR(50) NOT NULL CHECK (format IN ('single_elimination', 'double_elimination')),
    bracket_size INTEGER NOT NULL CHECK (bracket_size IN (8, 16, 32, 64, 128)),
    category VARCHAR(50), -- NULL for all categories (mixed)
    min_mmr INTEGER DEFAULT 0,
    max_mmr INTEGER DEFAULT 9999,
    question_count INTEGER DEFAULT 10,
    time_per_question_ms INTEGER DEFAULT 15000,
    registration_start TIMESTAMPTZ NOT NULL,
    registration_end TIMESTAMPTZ NOT NULL,
    tournament_start TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'registration', 'in_progress', 'completed', 'cancelled')),
    current_round INTEGER DEFAULT 0,
    total_rounds INTEGER,

    -- Rewards configuration
    rewards JSONB NOT NULL DEFAULT '{
        "1st": {"coins": 2000, "badge": "tournament_champion", "mmr_bonus": 100, "title": "Champion"},
        "2nd": {"coins": 1000, "badge": "tournament_finalist", "mmr_bonus": 50},
        "3rd": {"coins": 500, "badge": "tournament_semifinalist", "mmr_bonus": 25},
        "top8": {"coins": 250, "badge": "tournament_quarterfinalist", "mmr_bonus": 10},
        "participant": {"coins": 50}
    }',

    -- Spectator settings
    allow_spectators BOOLEAN DEFAULT true,
    spectator_count INTEGER DEFAULT 0,

    -- Question pool (optional - specific questions for this tournament)
    question_pool_ids UUID[],

    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tournament participants
CREATE TABLE IF NOT EXISTS tournament_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    seed_number INTEGER,
    mmr_at_registration INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'registered' CHECK (status IN ('registered', 'checked_in', 'active', 'eliminated', 'winner', 'forfeited', 'disqualified')),
    final_placement INTEGER,
    elimination_round INTEGER,

    -- For double elimination
    bracket_position VARCHAR(50) DEFAULT 'winners' CHECK (bracket_position IN ('winners', 'losers', 'grand_final')),
    losses_count INTEGER DEFAULT 0,

    -- Stats for this tournament
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,

    registered_at TIMESTAMPTZ DEFAULT NOW(),
    checked_in_at TIMESTAMPTZ,
    UNIQUE(tournament_id, user_id)
);

-- Tournament matches (bracket)
CREATE TABLE IF NOT EXISTS tournament_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    round_number INTEGER NOT NULL,
    match_number INTEGER NOT NULL,
    bracket_type VARCHAR(50) DEFAULT 'winners' CHECK (bracket_type IN ('winners', 'losers', 'grand_final')),

    player1_participant_id UUID REFERENCES tournament_participants(id),
    player2_participant_id UUID REFERENCES tournament_participants(id),
    winner_participant_id UUID REFERENCES tournament_participants(id),

    player1_score INTEGER,
    player2_score INTEGER,

    -- Link to actual Nakama match
    nakama_match_id VARCHAR(255),

    -- Match details
    questions_data JSONB,

    scheduled_time TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'in_progress', 'completed', 'bye', 'forfeit')),

    -- For advancing winners
    next_match_id UUID REFERENCES tournament_matches(id),
    next_match_slot INTEGER CHECK (next_match_slot IN (1, 2)),

    -- Spectator tracking
    spectator_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status, tournament_start);
CREATE INDEX IF NOT EXISTS idx_tournaments_registration ON tournaments(registration_start, registration_end) WHERE status IN ('upcoming', 'registration');
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament ON tournament_participants(tournament_id, status);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_user ON tournament_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_round ON tournament_matches(tournament_id, round_number, bracket_type);
CREATE INDEX IF NOT EXISTS idx_tournament_matches_status ON tournament_matches(status) WHERE status IN ('ready', 'in_progress');

-- ============================================================================
-- VIRTUAL CURRENCY & REWARDS SYSTEM
-- ============================================================================

-- User wallets
CREATE TABLE IF NOT EXISTS user_wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    coins INTEGER DEFAULT 0 CHECK (coins >= 0),
    gems INTEGER DEFAULT 0 CHECK (gems >= 0), -- Premium currency for future
    lifetime_coins_earned INTEGER DEFAULT 0,
    lifetime_coins_spent INTEGER DEFAULT 0,
    last_daily_claim TIMESTAMPTZ,
    daily_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Currency transactions (audit trail)
CREATE TABLE IF NOT EXISTS coin_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    amount INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN (
        'daily_reward', 'streak_bonus', 'match_win', 'match_participation',
        'tournament_reward', 'season_reward', 'achievement', 'donation_bonus',
        'admin_grant', 'purchase', 'refund'
    )),
    reference_type VARCHAR(50),
    reference_id VARCHAR(255),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Badges/Titles definition
CREATE TABLE IF NOT EXISTS badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    badge_key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    rarity VARCHAR(50) DEFAULT 'common' CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic')),
    category VARCHAR(50) CHECK (category IN ('achievement', 'tournament', 'season', 'donation', 'special', 'rank', 'streak')),
    is_title BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User earned badges
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    badge_id UUID NOT NULL REFERENCES badges(id),
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    earned_from VARCHAR(255),
    earned_metadata JSONB,
    is_equipped_badge BOOLEAN DEFAULT false,
    is_equipped_title BOOLEAN DEFAULT false,
    UNIQUE(user_id, badge_id)
);

-- Insert default badges
INSERT INTO badges (badge_key, name, description, rarity, category, is_title) VALUES
    -- Achievement badges
    ('first_win', 'First Victory', 'Won your first match', 'common', 'achievement', false),
    ('win_streak_5', 'On Fire', 'Won 5 matches in a row', 'uncommon', 'achievement', false),
    ('win_streak_10', 'Unstoppable', 'Won 10 matches in a row', 'rare', 'achievement', true),
    ('games_100', 'Dedicated Player', 'Played 100 matches', 'uncommon', 'achievement', false),
    ('games_500', 'Veteran', 'Played 500 matches', 'rare', 'achievement', true),
    ('games_1000', 'Legend', 'Played 1000 matches', 'epic', 'achievement', true),
    ('perfect_game', 'Perfect Score', 'Answered all questions correctly in a match', 'rare', 'achievement', false),
    ('speed_demon', 'Speed Demon', 'Won a match answering every question in under 3 seconds', 'epic', 'achievement', true),

    -- Tournament badges
    ('tournament_champion', 'Tournament Champion', 'Won a tournament', 'legendary', 'tournament', true),
    ('tournament_finalist', 'Tournament Finalist', 'Reached a tournament final', 'epic', 'tournament', false),
    ('tournament_semifinalist', 'Tournament Semifinalist', 'Reached tournament semifinals', 'rare', 'tournament', false),
    ('tournament_quarterfinalist', 'Tournament Quarterfinalist', 'Reached tournament quarterfinals', 'uncommon', 'tournament', false),
    ('tournament_participant', 'Tournament Participant', 'Participated in a tournament', 'common', 'tournament', false),
    ('tournament_wins_5', 'Tournament Master', 'Won 5 tournaments', 'mythic', 'tournament', true),

    -- Season badges
    ('season_grandmaster', 'Season Grandmaster', 'Finished #1 in a season', 'mythic', 'season', true),
    ('season_master', 'Season Master', 'Finished top 10 in a season', 'legendary', 'season', true),
    ('season_diamond', 'Season Diamond', 'Finished top 50 in a season', 'epic', 'season', false),
    ('season_platinum', 'Season Platinum', 'Finished top 100 in a season', 'rare', 'season', false),
    ('season_gold', 'Season Gold', 'Finished top 500 in a season', 'uncommon', 'season', false),
    ('season_participant', 'Season Participant', 'Played at least 10 games in a season', 'common', 'season', false),

    -- Rank badges
    ('rank_bronze', 'Bronze Tier', 'Reached Bronze rank', 'common', 'rank', false),
    ('rank_silver', 'Silver Tier', 'Reached Silver rank', 'common', 'rank', false),
    ('rank_gold', 'Gold Tier', 'Reached Gold rank', 'uncommon', 'rank', false),
    ('rank_platinum', 'Platinum Tier', 'Reached Platinum rank', 'rare', 'rank', false),
    ('rank_diamond', 'Diamond Tier', 'Reached Diamond rank', 'epic', 'rank', false),
    ('rank_master', 'Master Tier', 'Reached Master rank', 'legendary', 'rank', true),
    ('rank_grandmaster', 'Grandmaster Tier', 'Reached Grandmaster rank', 'mythic', 'rank', true),

    -- Streak badges
    ('streak_7', 'Weekly Warrior', 'Logged in 7 days in a row', 'common', 'streak', false),
    ('streak_30', 'Monthly Master', 'Logged in 30 days in a row', 'rare', 'streak', false),
    ('streak_100', 'Centurion', 'Logged in 100 days in a row', 'legendary', 'streak', true),

    -- Donation badges
    ('donor', 'Supporter', 'Made a donation to support the app', 'rare', 'donation', false),
    ('donor_gold', 'Gold Supporter', 'Donated $10 or more', 'epic', 'donation', true),
    ('donor_platinum', 'Platinum Supporter', 'Donated $50 or more', 'legendary', 'donation', true),
    ('donor_diamond', 'Diamond Supporter', 'Donated $100 or more', 'mythic', 'donation', true)
ON CONFLICT (badge_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user ON coin_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coin_transactions_type ON coin_transactions(transaction_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_equipped ON user_badges(user_id) WHERE is_equipped_badge = true OR is_equipped_title = true;

-- ============================================================================
-- NOTIFICATIONS SYSTEM
-- ============================================================================

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN (
        'tournament_reminder', 'tournament_start', 'tournament_match_ready',
        'tournament_reminder_1h', 'tournament_reminder_15m',
        'tournament_ready_check', 'tournament_match_forfeit_win', 'tournament_match_forfeit_loss',
        'tournament_eliminated', 'tournament_victory', 'tournament_complete',
        'friend_challenge', 'friend_request', 'friend_accepted',
        'daily_reward', 'streak_reminder',
        'season_start', 'season_end', 'season_reward',
        'badge_earned', 'rank_up', 'rank_down',
        'system', 'admin_message'
    )),
    title VARCHAR(255) NOT NULL,
    body TEXT,
    data JSONB,
    action_url VARCHAR(500),
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    push_sent BOOLEAN DEFAULT false,
    push_sent_at TIMESTAMPTZ,
    push_failed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Push notification tokens
CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    token VARCHAR(500) NOT NULL,
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('ios', 'android', 'web', 'telegram')),
    device_info JSONB,
    is_active BOOLEAN DEFAULT true,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, token)
);

-- Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL,
    tournament_reminders BOOLEAN DEFAULT true,
    friend_notifications BOOLEAN DEFAULT true,
    daily_reminders BOOLEAN DEFAULT true,
    season_notifications BOOLEAN DEFAULT true,
    achievement_notifications BOOLEAN DEFAULT true,
    push_enabled BOOLEAN DEFAULT true,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, created_at DESC) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_push_pending ON notifications(push_sent, created_at) WHERE push_sent = false AND push_failed = false;
CREATE INDEX IF NOT EXISTS idx_notifications_expires ON notifications(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id) WHERE is_active = true;

-- ============================================================================
-- ANALYTICS SYSTEM
-- ============================================================================

-- User daily activity tracking
CREATE TABLE IF NOT EXISTS user_activity_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    activity_date DATE NOT NULL,
    session_count INTEGER DEFAULT 1,
    total_session_seconds INTEGER DEFAULT 0,
    first_session_at TIMESTAMPTZ,
    last_session_at TIMESTAMPTZ,
    matches_played INTEGER DEFAULT 0,
    matches_won INTEGER DEFAULT 0,
    questions_answered INTEGER DEFAULT 0,
    questions_correct INTEGER DEFAULT 0,
    coins_earned INTEGER DEFAULT 0,
    coins_spent INTEGER DEFAULT 0,
    tournaments_joined INTEGER DEFAULT 0,
    UNIQUE(user_id, activity_date)
);

-- Question analytics (aggregated)
CREATE TABLE IF NOT EXISTS question_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_type VARCHAR(20) DEFAULT 'daily' CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    times_shown INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    times_incorrect INTEGER DEFAULT 0,
    times_timeout INTEGER DEFAULT 0,
    avg_answer_time_ms INTEGER,
    min_answer_time_ms INTEGER,
    max_answer_time_ms INTEGER,
    answer_distribution JSONB DEFAULT '{"0": 0, "1": 0, "2": 0, "3": 0}',
    UNIQUE(question_id, period_start, period_type)
);

-- Platform-wide daily analytics
CREATE TABLE IF NOT EXISTS platform_analytics_daily (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_date DATE UNIQUE NOT NULL,
    dau INTEGER DEFAULT 0,
    new_users INTEGER DEFAULT 0,
    returning_users INTEGER DEFAULT 0,
    churned_users INTEGER DEFAULT 0,
    total_sessions INTEGER DEFAULT 0,
    avg_session_seconds NUMERIC(10,2),
    total_matches INTEGER DEFAULT 0,
    total_tournament_matches INTEGER DEFAULT 0,
    total_questions_answered INTEGER DEFAULT 0,
    avg_questions_correct_pct NUMERIC(5,2),
    total_coins_earned INTEGER DEFAULT 0,
    total_coins_spent INTEGER DEFAULT 0,
    tournament_participants INTEGER DEFAULT 0,
    donations_count INTEGER DEFAULT 0,
    donations_total_cents INTEGER DEFAULT 0,
    peak_concurrent_users INTEGER DEFAULT 0,
    peak_concurrent_time TIMESTAMPTZ
);

-- Retention cohorts
CREATE TABLE IF NOT EXISTS retention_cohorts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cohort_date DATE NOT NULL,
    cohort_size INTEGER DEFAULT 0,
    day_1_retained INTEGER DEFAULT 0,
    day_3_retained INTEGER DEFAULT 0,
    day_7_retained INTEGER DEFAULT 0,
    day_14_retained INTEGER DEFAULT 0,
    day_30_retained INTEGER DEFAULT 0,
    day_60_retained INTEGER DEFAULT 0,
    day_90_retained INTEGER DEFAULT 0,
    UNIQUE(cohort_date)
);

CREATE INDEX IF NOT EXISTS idx_user_activity_date ON user_activity_daily(activity_date, user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity_daily(user_id, activity_date DESC);
CREATE INDEX IF NOT EXISTS idx_question_analytics_question ON question_analytics(question_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_question_analytics_period ON question_analytics(period_start, period_type);
CREATE INDEX IF NOT EXISTS idx_platform_analytics_date ON platform_analytics_daily(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_retention_cohorts_date ON retention_cohorts(cohort_date DESC);

-- ============================================================================
-- DONATIONS SYSTEM
-- ============================================================================

-- Donations
CREATE TABLE IF NOT EXISTS donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    currency VARCHAR(10) DEFAULT 'USD',
    payment_provider VARCHAR(50),
    payment_id VARCHAR(255),
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
    donor_name VARCHAR(255),
    donor_message TEXT,
    is_anonymous BOOLEAN DEFAULT false,
    badge_awarded_id UUID REFERENCES badges(id),
    coins_bonus INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Donation tiers (for badge awarding)
CREATE TABLE IF NOT EXISTS donation_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_name VARCHAR(100) NOT NULL,
    min_amount_cents INTEGER NOT NULL,
    badge_id UUID REFERENCES badges(id),
    coins_bonus INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

INSERT INTO donation_tiers (tier_name, min_amount_cents, coins_bonus) VALUES
    ('Supporter', 100, 100),
    ('Gold Supporter', 1000, 500),
    ('Platinum Supporter', 5000, 2500),
    ('Diamond Supporter', 10000, 10000)
ON CONFLICT DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_donations_user ON donations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_donations_status ON donations(payment_status) WHERE payment_status = 'pending';

-- ============================================================================
-- FUTURE-PROOFING: TEAMS/CLANS (Schema only, not fully implemented)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    tag VARCHAR(10) UNIQUE NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    banner_url VARCHAR(500),
    leader_id UUID NOT NULL,
    member_count INTEGER DEFAULT 1,
    max_members INTEGER DEFAULT 50,
    total_mmr INTEGER DEFAULT 0,
    avg_mmr INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    is_public BOOLEAN DEFAULT true,
    min_mmr_to_join INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clan_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    user_id UUID UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('leader', 'co_leader', 'elder', 'member')),
    contribution_points INTEGER DEFAULT 0,
    joined_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clan_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    invited_user_id UUID NOT NULL,
    invited_by UUID NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS idx_clans_name ON clans(name) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_clans_mmr ON clans(avg_mmr DESC) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_clan_members_clan ON clan_members(clan_id);
CREATE INDEX IF NOT EXISTS idx_clan_members_user ON clan_members(user_id);
CREATE INDEX IF NOT EXISTS idx_clan_invites_user ON clan_invites(invited_user_id, status) WHERE status = 'pending';

-- ============================================================================
-- FUTURE-PROOFING: POWER-UPS (Schema only, not fully implemented)
-- ============================================================================

CREATE TABLE IF NOT EXISTS power_up_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    power_up_key VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    icon_url VARCHAR(500),
    cost_coins INTEGER DEFAULT 0,
    effect_type VARCHAR(50) CHECK (effect_type IN ('fifty_fifty', 'skip', 'time_freeze', 'double_points', 'hint')),
    effect_value JSONB,
    duration_seconds INTEGER,
    max_per_match INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_power_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    power_up_id UUID NOT NULL REFERENCES power_up_types(id),
    quantity INTEGER DEFAULT 0 CHECK (quantity >= 0),
    UNIQUE(user_id, power_up_id)
);

-- Insert power-up templates (inactive by default)
INSERT INTO power_up_types (power_up_key, name, description, cost_coins, effect_type, effect_value, max_per_match, is_active) VALUES
    ('fifty_fifty', '50/50', 'Eliminates two wrong answers', 100, 'fifty_fifty', '{"remove_count": 2}', 1, false),
    ('skip', 'Skip Question', 'Skip the current question without penalty', 150, 'skip', '{}', 1, false),
    ('time_freeze', 'Time Freeze', 'Pause the timer for 5 seconds', 75, 'time_freeze', '{"freeze_seconds": 5}', 2, false),
    ('double_points', 'Double Points', 'Double points for the next correct answer', 200, 'double_points', '{"multiplier": 2}', 1, false),
    ('hint', 'Hint', 'Get a hint about the correct answer', 50, 'hint', '{}', 2, false)
ON CONFLICT (power_up_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_user_power_ups_user ON user_power_ups(user_id);

-- ============================================================================
-- FUTURE-PROOFING: MULTI-LANGUAGE SUPPORT
-- ============================================================================

-- Add language support to questions table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'questions' AND column_name = 'language'
    ) THEN
        ALTER TABLE questions ADD COLUMN language VARCHAR(10) DEFAULT 'en';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'questions' AND column_name = 'translations'
    ) THEN
        ALTER TABLE questions ADD COLUMN translations JSONB DEFAULT '{}';
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_questions_language ON questions(language, category) WHERE is_active = true;

-- ============================================================================
-- MODIFICATIONS TO EXISTING TABLES
-- ============================================================================

-- Add tournament tracking to match_history
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'match_history' AND column_name = 'tournament_id'
    ) THEN
        ALTER TABLE match_history ADD COLUMN tournament_id UUID REFERENCES tournaments(id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'match_history' AND column_name = 'tournament_round'
    ) THEN
        ALTER TABLE match_history ADD COLUMN tournament_round INTEGER;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'match_history' AND column_name = 'game_mode'
    ) THEN
        ALTER TABLE match_history ADD COLUMN game_mode VARCHAR(50) DEFAULT 'standard';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'match_history' AND column_name = 'spectator_count'
    ) THEN
        ALTER TABLE match_history ADD COLUMN spectator_count INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'match_history' AND column_name = 'question_count'
    ) THEN
        ALTER TABLE match_history ADD COLUMN question_count INTEGER;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'match_history' AND column_name = 'season_id'
    ) THEN
        ALTER TABLE match_history ADD COLUMN season_id UUID REFERENCES seasons(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_match_history_tournament ON match_history(tournament_id) WHERE tournament_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_match_history_season ON match_history(season_id) WHERE season_id IS NOT NULL;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to get current active season
CREATE OR REPLACE FUNCTION get_active_season() RETURNS UUID AS $$
DECLARE
    v_season_id UUID;
BEGIN
    SELECT id INTO v_season_id
    FROM seasons
    WHERE is_active = true
    AND NOW() BETWEEN start_date AND end_date
    LIMIT 1;

    RETURN v_season_id;
END;
$$ LANGUAGE plpgsql;

-- Function to award coins to a user
CREATE OR REPLACE FUNCTION award_coins(
    p_user_id UUID,
    p_amount INTEGER,
    p_transaction_type VARCHAR(50),
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    -- Ensure wallet exists
    INSERT INTO user_wallets (user_id, coins, lifetime_coins_earned)
    VALUES (p_user_id, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;

    -- Update balance
    UPDATE user_wallets
    SET coins = coins + p_amount,
        lifetime_coins_earned = CASE WHEN p_amount > 0 THEN lifetime_coins_earned + p_amount ELSE lifetime_coins_earned END,
        lifetime_coins_spent = CASE WHEN p_amount < 0 THEN lifetime_coins_spent + ABS(p_amount) ELSE lifetime_coins_spent END,
        updated_at = NOW()
    WHERE user_id = p_user_id
    RETURNING coins INTO v_new_balance;

    -- Record transaction
    INSERT INTO coin_transactions (user_id, amount, balance_after, transaction_type, reference_type, reference_id, description)
    VALUES (p_user_id, p_amount, v_new_balance, p_transaction_type, p_reference_type, p_reference_id, p_description);

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- Function to award badge to a user
CREATE OR REPLACE FUNCTION award_badge(
    p_user_id UUID,
    p_badge_key VARCHAR(100),
    p_earned_from VARCHAR(255) DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    v_badge_id UUID;
BEGIN
    SELECT id INTO v_badge_id FROM badges WHERE badge_key = p_badge_key AND is_active = true;

    IF v_badge_id IS NULL THEN
        RETURN false;
    END IF;

    INSERT INTO user_badges (user_id, badge_id, earned_from, earned_metadata)
    VALUES (p_user_id, v_badge_id, p_earned_from, p_metadata)
    ON CONFLICT (user_id, badge_id) DO NOTHING;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function to create notification
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id UUID,
    p_type VARCHAR(50),
    p_title VARCHAR(255),
    p_body TEXT DEFAULT NULL,
    p_data JSONB DEFAULT NULL,
    p_action_url VARCHAR(500) DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO notifications (user_id, type, title, body, data, action_url, expires_at)
    VALUES (p_user_id, p_type, p_title, p_body, p_data, p_action_url, p_expires_at)
    RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate tournament bracket rounds
CREATE OR REPLACE FUNCTION calculate_bracket_rounds(p_bracket_size INTEGER) RETURNS INTEGER AS $$
BEGIN
    RETURN CEIL(LOG(2, p_bracket_size))::INTEGER;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLE COMMENTS
-- ============================================================================

COMMENT ON TABLE game_config IS 'Admin-configurable game settings (question counts, timers, etc.)';
COMMENT ON TABLE seasons IS 'Monthly/periodic competitive seasons';
COMMENT ON TABLE season_rankings IS 'Per-season player rankings and rewards';
COMMENT ON TABLE tournaments IS 'Scheduled bracket tournaments';
COMMENT ON TABLE tournament_participants IS 'Players registered for tournaments';
COMMENT ON TABLE tournament_matches IS 'Individual matches within tournament brackets';
COMMENT ON TABLE user_wallets IS 'Virtual currency balances per user';
COMMENT ON TABLE coin_transactions IS 'Audit trail for all currency changes';
COMMENT ON TABLE badges IS 'Badge/title definitions';
COMMENT ON TABLE user_badges IS 'Badges earned by users';
COMMENT ON TABLE notifications IS 'In-app and push notifications';
COMMENT ON TABLE push_tokens IS 'Device tokens for push notifications';
COMMENT ON TABLE user_activity_daily IS 'Daily activity metrics per user';
COMMENT ON TABLE question_analytics IS 'Aggregated question performance metrics';
COMMENT ON TABLE platform_analytics_daily IS 'Platform-wide daily metrics';
COMMENT ON TABLE donations IS 'User donations tracking';
COMMENT ON TABLE clans IS 'Teams/clans for group competition (future)';
COMMENT ON TABLE power_up_types IS 'In-game power-ups (future)';
