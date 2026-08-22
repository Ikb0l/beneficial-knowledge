-- AI question generation subsystem
-- DeepSeek-first, pluggable provider profiles, source packs, jobs, safeguards, and review queue.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- Questions table provenance columns
-- ----------------------------------------------------------------------------

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS created_via VARCHAR(20) NOT NULL DEFAULT 'manual';

ALTER TABLE questions
  DROP CONSTRAINT IF EXISTS questions_created_via_check;

ALTER TABLE questions
  ADD CONSTRAINT questions_created_via_check
  CHECK (created_via IN ('manual', 'import', 'ai'));

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS ai_candidate_id UUID;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS source_pack_id UUID;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS citation_data JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE questions
  ADD COLUMN IF NOT EXISTS quality_gate_report JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ----------------------------------------------------------------------------
-- Provider credentials and profiles
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_provider_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_key VARCHAR(50) NOT NULL UNIQUE,
  encrypted_secret BYTEA NOT NULL,
  secret_hint VARCHAR(32) DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_provider_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key VARCHAR(80) NOT NULL UNIQUE,
  provider_key VARCHAR(50) NOT NULL DEFAULT 'deepseek',
  credential_provider_key VARCHAR(50) NOT NULL DEFAULT 'deepseek',
  endpoint_url TEXT NOT NULL DEFAULT 'https://api.deepseek.com/chat/completions',
  model VARCHAR(120) NOT NULL DEFAULT 'deepseek-chat',
  temperature NUMERIC(4, 3) NOT NULL DEFAULT 0.3,
  top_p NUMERIC(4, 3) NOT NULL DEFAULT 1.0,
  max_tokens INTEGER NOT NULL DEFAULT 1400,
  timeout_ms INTEGER NOT NULL DEFAULT 45000,
  max_retries INTEGER NOT NULL DEFAULT 2,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_provider_profiles_temperature_check CHECK (temperature >= 0 AND temperature <= 2),
  CONSTRAINT ai_provider_profiles_top_p_check CHECK (top_p > 0 AND top_p <= 1),
  CONSTRAINT ai_provider_profiles_max_tokens_check CHECK (max_tokens >= 64 AND max_tokens <= 16000),
  CONSTRAINT ai_provider_profiles_timeout_ms_check CHECK (timeout_ms >= 1000 AND timeout_ms <= 120000),
  CONSTRAINT ai_provider_profiles_max_retries_check CHECK (max_retries >= 0 AND max_retries <= 10)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_profiles_active
  ON ai_provider_profiles(is_active, provider_key, model);

-- ----------------------------------------------------------------------------
-- Global AI settings and per-category overrides
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_generation_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settings_key VARCHAR(50) NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{
    "enabled": false,
    "killSwitch": true,
    "autoPublish": true,
    "strictMode": true,
    "maxQuestionsPerRun": 20,
    "maxInputTokensPerRun": 6000,
    "maxOutputTokensPerRun": 4000,
    "dailyBudgetUsd": 5,
    "monthlyBudgetUsd": 150,
    "similarityThreshold": 0.92,
    "requireCitation": true,
    "defaultLanguage": "en",
    "allowedQuestionTypes": ["mcq", "true_false", "true_false_not_given", "heading_match"],
    "defaultProfileKey": "deepseek_default"
  }'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_source_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_key VARCHAR(100) NOT NULL UNIQUE,
  category_key VARCHAR(50) NOT NULL REFERENCES categories(category_key) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_source_packs_status_check CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_ai_source_packs_category
  ON ai_source_packs(category_key, is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_category_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_key VARCHAR(50) NOT NULL UNIQUE REFERENCES categories(category_key) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  profile_id UUID REFERENCES ai_provider_profiles(id) ON DELETE SET NULL,
  source_pack_id UUID REFERENCES ai_source_packs(id) ON DELETE SET NULL,
  override_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  budgets JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- Source documents/chunks (for citation-backed generation)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_pack_id UUID NOT NULL REFERENCES ai_source_packs(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  hash_sha256 VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_source_documents_pack
  ON ai_source_documents(source_pack_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_source_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES ai_source_documents(id) ON DELETE CASCADE,
  source_pack_id UUID NOT NULL REFERENCES ai_source_packs(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_normalized TEXT NOT NULL DEFAULT '',
  token_estimate INTEGER NOT NULL DEFAULT 0,
  hash_sha256 VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(source_document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_ai_source_chunks_pack
  ON ai_source_chunks(source_pack_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_source_chunks_content_trgm
  ON ai_source_chunks USING GIN (content gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- Generation jobs, candidates, and failures
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ai_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL,
  trigger_type VARCHAR(20) NOT NULL DEFAULT 'manual',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  category_key VARCHAR(50) NOT NULL REFERENCES categories(category_key) ON DELETE CASCADE,
  source_pack_id UUID REFERENCES ai_source_packs(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES ai_provider_profiles(id) ON DELETE SET NULL,
  question_target_count INTEGER NOT NULL DEFAULT 10,
  auto_publish BOOLEAN NOT NULL DEFAULT true,
  strict_mode BOOLEAN NOT NULL DEFAULT true,
  allowed_question_types JSONB NOT NULL DEFAULT '["mcq", "true_false", "true_false_not_given", "heading_match"]'::jsonb,
  schedule_interval_minutes INTEGER,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_generation_jobs_trigger_type_check CHECK (trigger_type IN ('manual', 'scheduled', 'retry')),
  CONSTRAINT ai_generation_jobs_status_check CHECK (status IN ('scheduled', 'pending', 'running', 'completed', 'failed', 'cancelled')),
  CONSTRAINT ai_generation_jobs_question_target_count_check CHECK (question_target_count >= 1 AND question_target_count <= 500),
  CONSTRAINT ai_generation_jobs_schedule_interval_minutes_check CHECK (schedule_interval_minutes IS NULL OR (schedule_interval_minutes >= 5 AND schedule_interval_minutes <= 10080))
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_status
  ON ai_generation_jobs(status, next_run_at, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_generated_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES ai_generation_jobs(id) ON DELETE SET NULL,
  category_key VARCHAR(50) NOT NULL REFERENCES categories(category_key) ON DELETE CASCADE,
  source_pack_id UUID REFERENCES ai_source_packs(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES ai_provider_profiles(id) ON DELETE SET NULL,
  question_data JSONB NOT NULL,
  normalized_question_text TEXT NOT NULL,
  question_hash VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'needs_review',
  gate_report JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  published_question_id UUID REFERENCES questions(id) ON DELETE SET NULL,
  created_by UUID,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ai_generated_candidates_status_check CHECK (status IN ('needs_review', 'approved', 'rejected', 'published', 'invalid'))
);

CREATE INDEX IF NOT EXISTS idx_ai_generated_candidates_review
  ON ai_generated_candidates(status, category_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_generated_candidates_text_trgm
  ON ai_generated_candidates USING GIN (normalized_question_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS ai_generation_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES ai_generation_jobs(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES ai_generated_candidates(id) ON DELETE CASCADE,
  failure_type VARCHAR(60) NOT NULL,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_failures_job
  ON ai_generation_failures(job_id, created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'questions_ai_candidate_fk'
      AND table_name = 'questions'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_ai_candidate_fk
      FOREIGN KEY (ai_candidate_id)
      REFERENCES ai_generated_candidates(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'questions_source_pack_fk'
      AND table_name = 'questions'
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_source_pack_fk
      FOREIGN KEY (source_pack_id)
      REFERENCES ai_source_packs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_questions_created_via
  ON questions(created_via, category, is_active);

CREATE INDEX IF NOT EXISTS idx_questions_text_similarity
  ON questions USING GIN (question_text gin_trgm_ops);

INSERT INTO ai_generation_settings (settings_key)
VALUES ('global')
ON CONFLICT (settings_key) DO NOTHING;

INSERT INTO ai_provider_profiles (
  profile_key,
  provider_key,
  credential_provider_key,
  endpoint_url,
  model,
  temperature,
  top_p,
  max_tokens,
  timeout_ms,
  max_retries,
  is_default,
  is_active,
  config,
  budgets
)
VALUES (
  'deepseek_default',
  'deepseek',
  'deepseek',
  'https://api.deepseek.com/chat/completions',
  'deepseek-chat',
  0.3,
  1.0,
  1400,
  45000,
  2,
  true,
  true,
  '{"responseFormat": "json_object"}'::jsonb,
  '{"dailyUsd": 5, "monthlyUsd": 150}'::jsonb
)
ON CONFLICT (profile_key) DO NOTHING;
