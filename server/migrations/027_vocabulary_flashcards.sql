-- Vocabulary flashcards subsystem
-- Adds FSRS-driven learner state, deck assignment, and admin import pipeline.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- VOCABULARY CONTENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_key VARCHAR(120) NOT NULL UNIQUE,
  headword_en TEXT NOT NULL,
  part_of_speech VARCHAR(40) DEFAULT '',
  cefr_level VARCHAR(10) DEFAULT '',
  frequency_rank INTEGER,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_terms_cefr_check CHECK (
    cefr_level IN ('', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2')
  )
);

CREATE TABLE IF NOT EXISTS vocab_term_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES vocab_terms(id) ON DELETE CASCADE,
  language_code VARCHAR(5) NOT NULL,
  translation_primary TEXT NOT NULL,
  translation_alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_term_translations_language_check CHECK (language_code IN ('uz')),
  CONSTRAINT vocab_term_translations_unique UNIQUE (term_id, language_code)
);

CREATE TABLE IF NOT EXISTS vocab_pronunciation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL UNIQUE REFERENCES vocab_terms(id) ON DELETE CASCADE,
  ipa TEXT NOT NULL,
  stress_pattern TEXT DEFAULT '',
  syllables JSONB NOT NULL DEFAULT '[]'::jsonb,
  transliteration_hint TEXT DEFAULT '',
  audio_word_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vocab_examples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES vocab_terms(id) ON DELETE CASCADE,
  sentence_en TEXT NOT NULL,
  translation_uz TEXT NOT NULL,
  audio_sentence_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vocab_word_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES vocab_terms(id) ON DELETE CASCADE,
  form_type VARCHAR(60) NOT NULL,
  form_value TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_word_forms_unique UNIQUE (term_id, form_type, form_value)
);

CREATE TABLE IF NOT EXISTS vocab_collocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES vocab_terms(id) ON DELETE CASCADE,
  phrase TEXT NOT NULL,
  translation_uz TEXT,
  note TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vocab_syn_ant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  term_id UUID NOT NULL REFERENCES vocab_terms(id) ON DELETE CASCADE,
  relation_type VARCHAR(20) NOT NULL,
  related_term_id UUID REFERENCES vocab_terms(id) ON DELETE SET NULL,
  related_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_syn_ant_relation_check CHECK (relation_type IN ('synonym', 'antonym'))
);

-- ============================================================================
-- DECKS, COHORTS, ASSIGNMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_key VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  cefr_level VARCHAR(10) DEFAULT '',
  topic VARCHAR(120) DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_decks_cefr_check CHECK (
    cefr_level IN ('', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2')
  )
);

CREATE TABLE IF NOT EXISTS vocab_deck_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID NOT NULL REFERENCES vocab_decks(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES vocab_terms(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_deck_items_unique UNIQUE (deck_id, term_id)
);

CREATE TABLE IF NOT EXISTS learning_cohorts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_key VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS learning_cohort_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES learning_cohorts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT learning_cohort_members_unique UNIQUE (cohort_id, user_id)
);

CREATE TABLE IF NOT EXISTS vocab_cohort_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id UUID NOT NULL REFERENCES learning_cohorts(id) ON DELETE CASCADE,
  deck_id UUID NOT NULL REFERENCES vocab_decks(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  max_new_per_day INTEGER NOT NULL DEFAULT 20,
  backlog_reduce_threshold INTEGER NOT NULL DEFAULT 80,
  backlog_reduce_factor NUMERIC(4,2) NOT NULL DEFAULT 0.50,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_cohort_assignments_unique UNIQUE (cohort_id, deck_id),
  CONSTRAINT vocab_cohort_assignments_new_limit_check CHECK (max_new_per_day BETWEEN 1 AND 200),
  CONSTRAINT vocab_cohort_assignments_backlog_check CHECK (backlog_reduce_threshold BETWEEN 1 AND 1000),
  CONSTRAINT vocab_cohort_assignments_reduce_factor_check CHECK (backlog_reduce_factor > 0 AND backlog_reduce_factor <= 1)
);

CREATE TABLE IF NOT EXISTS vocab_daily_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES vocab_cohort_assignments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  limit_date DATE NOT NULL,
  max_new_cards INTEGER NOT NULL DEFAULT 20,
  max_review_cards INTEGER NOT NULL DEFAULT 300,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_daily_limits_unique UNIQUE (assignment_id, user_id, limit_date),
  CONSTRAINT vocab_daily_limits_new_check CHECK (max_new_cards BETWEEN 0 AND 200),
  CONSTRAINT vocab_daily_limits_review_check CHECK (max_review_cards BETWEEN 1 AND 2000)
);

-- ============================================================================
-- LEARNER STATE + REVIEW EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_learner_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  term_id UUID NOT NULL REFERENCES vocab_terms(id) ON DELETE CASCADE,
  difficulty NUMERIC(8,4) NOT NULL DEFAULT 5,
  stability NUMERIC(12,6) NOT NULL DEFAULT 0.4,
  retrievability NUMERIC(8,6) NOT NULL DEFAULT 1,
  due_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMPTZ,
  reps INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,
  consecutive_success INTEGER NOT NULL DEFAULT 0,
  last_grade VARCHAR(10),
  mastered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_learner_state_unique UNIQUE (user_id, term_id),
  CONSTRAINT vocab_learner_state_grade_check CHECK (last_grade IS NULL OR last_grade IN ('again', 'hard', 'good', 'easy')),
  CONSTRAINT vocab_learner_state_difficulty_check CHECK (difficulty >= 1 AND difficulty <= 10),
  CONSTRAINT vocab_learner_state_stability_check CHECK (stability > 0),
  CONSTRAINT vocab_learner_state_retrievability_check CHECK (retrievability >= 0 AND retrievability <= 1)
);

CREATE TABLE IF NOT EXISTS vocab_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  term_id UUID NOT NULL REFERENCES vocab_terms(id) ON DELETE CASCADE,
  session_id UUID,
  item_id VARCHAR(180),
  exercise_type VARCHAR(60) NOT NULL,
  grade VARCHAR(10) NOT NULL,
  answer_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_ms INTEGER,
  state_before JSONB NOT NULL DEFAULT '{}'::jsonb,
  state_after JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_review_events_grade_check CHECK (grade IN ('again', 'hard', 'good', 'easy'))
);

-- ============================================================================
-- IMPORT PIPELINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS vocab_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID,
  source VARCHAR(120) NOT NULL DEFAULT '',
  schema_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_rows INTEGER NOT NULL DEFAULT 0,
  valid_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  source_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  report JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at TIMESTAMPTZ,
  CONSTRAINT vocab_import_jobs_status_check CHECK (status IN ('pending', 'validated', 'failed', 'committed'))
);

CREATE TABLE IF NOT EXISTS vocab_import_job_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES vocab_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  term_key VARCHAR(120),
  status VARCHAR(20) NOT NULL,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  normalized_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vocab_import_job_rows_status_check CHECK (status IN ('valid', 'invalid', 'committed', 'skipped')),
  CONSTRAINT vocab_import_job_rows_unique UNIQUE (job_id, row_number)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_vocab_terms_active ON vocab_terms(is_active, headword_en);
CREATE INDEX IF NOT EXISTS idx_vocab_terms_cefr ON vocab_terms(cefr_level, is_active);
CREATE INDEX IF NOT EXISTS idx_vocab_term_translations_lang ON vocab_term_translations(language_code, term_id);
CREATE INDEX IF NOT EXISTS idx_vocab_examples_term ON vocab_examples(term_id, display_order);
CREATE INDEX IF NOT EXISTS idx_vocab_word_forms_term ON vocab_word_forms(term_id, display_order);
CREATE INDEX IF NOT EXISTS idx_vocab_collocations_term ON vocab_collocations(term_id, display_order);
CREATE INDEX IF NOT EXISTS idx_vocab_syn_ant_term ON vocab_syn_ant(term_id, relation_type);

CREATE INDEX IF NOT EXISTS idx_vocab_decks_active ON vocab_decks(is_active, name);
CREATE INDEX IF NOT EXISTS idx_vocab_deck_items_deck ON vocab_deck_items(deck_id, display_order);
CREATE INDEX IF NOT EXISTS idx_learning_cohorts_active ON learning_cohorts(is_active, name);
CREATE INDEX IF NOT EXISTS idx_learning_cohort_members_user ON learning_cohort_members(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vocab_assignments_cohort ON vocab_cohort_assignments(cohort_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vocab_assignments_schedule ON vocab_cohort_assignments(start_at, end_at) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_vocab_daily_limits_user ON vocab_daily_limits(user_id, limit_date DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_learner_state_due ON vocab_learner_state(user_id, due_at ASC);
CREATE INDEX IF NOT EXISTS idx_vocab_learner_state_mastered ON vocab_learner_state(user_id, mastered_at);
CREATE INDEX IF NOT EXISTS idx_vocab_review_events_user ON vocab_review_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vocab_review_events_session ON vocab_review_events(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_import_jobs_status ON vocab_import_jobs(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vocab_import_rows_job ON vocab_import_job_rows(job_id, row_number);

COMMENT ON TABLE vocab_terms IS 'English vocabulary headwords for flashcard learning.';
COMMENT ON TABLE vocab_learner_state IS 'Per learner-term FSRS scheduling state.';
COMMENT ON TABLE vocab_review_events IS 'Immutable review event log for analytics and auditability.';
COMMENT ON TABLE vocab_import_jobs IS 'Versioned import jobs for strict JSON vocabulary ingestion.';
