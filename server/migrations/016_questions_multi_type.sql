-- ============================================================================
-- Questions: Multi-type + variable option counts
-- Adds question_type and relaxes MCQ-only constraints (0..3) to support
-- TF, TFNG, and IELTS-like single-choice question types.
-- ============================================================================

-- Add question_type column (default to existing MCQ behavior)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'questions' AND column_name = 'question_type'
  ) THEN
    ALTER TABLE questions
      ADD COLUMN question_type VARCHAR(50) NOT NULL DEFAULT 'mcq';
  END IF;
END $$;

-- Drop old 0..3 check constraint on correct_index (created by 001_initial_schema.sql)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'questions_correct_index_check'
      AND conrelid = 'questions'::regclass
  ) THEN
    ALTER TABLE questions DROP CONSTRAINT questions_correct_index_check;
  END IF;
END $$;

-- Ensure options is an array, length is 2..6, and correct_index fits within options length
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'questions_options_is_array_check'
      AND conrelid = 'questions'::regclass
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_options_is_array_check
      CHECK (jsonb_typeof(options) = 'array');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'questions_options_len_check'
      AND conrelid = 'questions'::regclass
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_options_len_check
      CHECK (jsonb_array_length(options) BETWEEN 2 AND 6);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'questions_correct_index_range_check'
      AND conrelid = 'questions'::regclass
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_correct_index_range_check
      CHECK (correct_index >= 0 AND correct_index < jsonb_array_length(options));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'questions_question_type_check'
      AND conrelid = 'questions'::regclass
  ) THEN
    ALTER TABLE questions
      ADD CONSTRAINT questions_question_type_check
      CHECK (question_type IN ('mcq', 'true_false', 'true_false_not_given', 'heading_match'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_questions_type
  ON questions(question_type)
  WHERE is_active = true;

