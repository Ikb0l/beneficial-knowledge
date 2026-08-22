-- Beneficial Knowledge - Initial Database Schema
-- This migration creates the custom tables needed beyond Nakama's built-in tables

-- Note: Nakama already provides users, leaderboards, storage, and matches tables
-- These are additional tables for quiz-specific functionality

-- Required for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Questions table
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(50) NOT NULL,
    difficulty VARCHAR(20) NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    question_text TEXT NOT NULL,
    options JSONB NOT NULL,  -- Array of 4 options
    correct_index SMALLINT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
    explanation TEXT,
    source_reference TEXT,  -- Quran/Hadith reference
    times_shown INTEGER DEFAULT 0,
    times_correct INTEGER DEFAULT 0,
    average_answer_time_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true
);

-- Match history for detailed analytics
CREATE TABLE IF NOT EXISTS match_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    player1_id UUID NOT NULL,
    player2_id UUID NOT NULL,
    player1_score INTEGER NOT NULL,
    player2_score INTEGER NOT NULL,
    winner_id UUID,  -- NULL for draw
    player1_mmr_before INTEGER NOT NULL,
    player2_mmr_before INTEGER NOT NULL,
    player1_mmr_after INTEGER NOT NULL,
    player2_mmr_after INTEGER NOT NULL,
    questions_data JSONB NOT NULL,  -- Question IDs, answers, times
    duration_seconds INTEGER NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily challenges
CREATE TABLE IF NOT EXISTS daily_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_date DATE NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL,
    question_ids UUID[] NOT NULL,
    reward_coins INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User daily challenge completions
CREATE TABLE IF NOT EXISTS user_daily_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    challenge_id UUID NOT NULL REFERENCES daily_challenges(id),
    score INTEGER NOT NULL,
    time_taken_seconds INTEGER,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, challenge_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_questions_category_difficulty
    ON questions(category, difficulty) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_questions_category
    ON questions(category) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_match_history_player1
    ON match_history(player1_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_history_player2
    ON match_history(player2_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_history_completed
    ON match_history(completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_daily_challenges_date
    ON daily_challenges(challenge_date DESC);

-- Create leaderboards (Nakama built-in, but we need to initialize them)
-- These are created via Nakama API, not SQL, but documented here for reference:
-- - global_mmr: Global MMR leaderboard
-- - weekly_mmr: Weekly reset leaderboard
-- - category_prophets: Per-category leaderboard
-- - category_muhammad: Per-category leaderboard
-- - category_abu_bakr: Per-category leaderboard
-- - category_umar: Per-category leaderboard
-- - category_uthman: Per-category leaderboard
-- - category_ali: Per-category leaderboard
-- - category_umar_ii_saladin: Per-category leaderboard
