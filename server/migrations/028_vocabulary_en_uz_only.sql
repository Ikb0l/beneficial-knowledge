-- Convert vocabulary subsystem to EN + UZ only.
-- Removes Russian translation fields and tightens language constraints.

BEGIN;

DELETE FROM vocab_term_translations
WHERE language_code <> 'uz';

ALTER TABLE vocab_term_translations
  DROP CONSTRAINT IF EXISTS vocab_term_translations_language_check;

ALTER TABLE vocab_term_translations
  ADD CONSTRAINT vocab_term_translations_language_check
  CHECK (language_code IN ('uz'));

ALTER TABLE vocab_examples
  DROP COLUMN IF EXISTS translation_ru;

ALTER TABLE vocab_collocations
  DROP COLUMN IF EXISTS translation_ru;

COMMIT;
