-- Add passage_text column for IELTS-style reading passage questions
-- Allows questions to carry a short excerpt (3-5 sentences) for competitive mode

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'questions' AND column_name = 'passage_text'
  ) THEN
    ALTER TABLE questions
      ADD COLUMN passage_text TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

COMMENT ON COLUMN questions.passage_text IS 'Short reading passage excerpt (3-5 sentences) for IELTS-style competitive questions';
