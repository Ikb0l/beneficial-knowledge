-- Extend vocabulary mini-games with Diction mode.

ALTER TABLE vocab_game_items
  ADD COLUMN IF NOT EXISTS highlighted_word TEXT,
  ADD COLUMN IF NOT EXISTS correction_word TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'vocab_game_items'::regclass
      AND conname = 'vocab_game_items_mode_check'
  ) THEN
    ALTER TABLE vocab_game_items DROP CONSTRAINT vocab_game_items_mode_check;
  END IF;
END $$;

ALTER TABLE vocab_game_items
  ADD CONSTRAINT vocab_game_items_mode_check
  CHECK (mode IN ('association', 'agility', 'context', 'recall', 'diction'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'vocab_game_items'::regclass
      AND conname = 'vocab_game_items_options_array_check'
  ) THEN
    ALTER TABLE vocab_game_items DROP CONSTRAINT vocab_game_items_options_array_check;
  END IF;
END $$;

ALTER TABLE vocab_game_items
  ADD CONSTRAINT vocab_game_items_options_array_check
  CHECK (
    jsonb_typeof(options_json) = 'array'
    AND (
      (mode IN ('association', 'agility') AND jsonb_array_length(options_json) = 3)
      OR (mode = 'context' AND jsonb_array_length(options_json) = 2)
      OR (mode = 'recall' AND jsonb_array_length(options_json) = 0)
      OR (
        mode = 'diction'
        AND jsonb_array_length(options_json) = 2
        AND options_json @> '["error"]'::jsonb
        AND options_json @> '["valid"]'::jsonb
      )
    )
  );

ALTER TABLE vocab_game_items
  DROP CONSTRAINT IF EXISTS vocab_game_items_context_payload_check;

ALTER TABLE vocab_game_items
  ADD CONSTRAINT vocab_game_items_context_payload_check
  CHECK (
    (
      mode IN ('association', 'agility')
      AND NULLIF(BTRIM(prompt_word), '') IS NOT NULL
    )
    OR (
      mode = 'context'
      AND NULLIF(BTRIM(context_sentence), '') IS NOT NULL
      AND POSITION('____' IN context_sentence) > 0
    )
    OR (
      mode = 'recall'
      AND NULLIF(BTRIM(context_sentence), '') IS NOT NULL
      AND NULLIF(BTRIM(correct_option), '') IS NOT NULL
      AND BTRIM(correct_option) ~ '^[A-Za-z]{4,10}$'
    )
    OR (
      mode = 'diction'
      AND NULLIF(BTRIM(context_sentence), '') IS NOT NULL
      AND NULLIF(BTRIM(highlighted_word), '') IS NOT NULL
      AND LOWER(BTRIM(correct_option)) IN ('valid', 'error')
      AND (
        LOWER(BTRIM(correct_option)) <> 'error'
        OR NULLIF(BTRIM(correction_word), '') IS NOT NULL
      )
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'vocab_game_sessions'::regclass
      AND conname = 'vocab_game_sessions_mode_check'
  ) THEN
    ALTER TABLE vocab_game_sessions DROP CONSTRAINT vocab_game_sessions_mode_check;
  END IF;
END $$;

ALTER TABLE vocab_game_sessions
  ADD CONSTRAINT vocab_game_sessions_mode_check
  CHECK (mode IN ('association', 'agility', 'context', 'recall', 'diction'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'vocab_game_attempts'::regclass
      AND conname = 'vocab_game_attempts_mode_check'
  ) THEN
    ALTER TABLE vocab_game_attempts DROP CONSTRAINT vocab_game_attempts_mode_check;
  END IF;
END $$;

ALTER TABLE vocab_game_attempts
  ADD CONSTRAINT vocab_game_attempts_mode_check
  CHECK (mode IN ('association', 'agility', 'context', 'recall', 'diction'));

INSERT INTO vocab_game_items (
  mode,
  prompt_word,
  context_sentence,
  highlighted_word,
  correction_word,
  correct_option,
  options_json,
  difficulty_level,
  cefr_level,
  relation_strength,
  tags,
  notes,
  is_active,
  created_at,
  updated_at
)
SELECT
  seed.mode,
  seed.prompt_word,
  seed.context_sentence,
  seed.highlighted_word,
  seed.correction_word,
  seed.correct_option,
  seed.options_json::jsonb,
  seed.difficulty_level,
  seed.cefr_level,
  NULL,
  seed.tags::jsonb,
  seed.notes,
  true,
  NOW(),
  NOW()
FROM (
  VALUES
    ('diction', 'sweetly', 'The tea was too sweetly for my taste.', 'sweetly', 'sweet', 'error', '["error","valid"]', 3, 'b1', '["diction","adverb"]', 'Adverb used where adjective is required'),
    ('diction', 'fewer', 'There are fewer reasons to delay the decision now.', 'fewer', NULL, 'valid', '["error","valid"]', 2, 'a2', '["diction","quantifier"]', 'Countable noun agreement is correct'),
    ('diction', 'interested', 'The lecture was very interested.', 'interested', 'interesting', 'error', '["error","valid"]', 3, 'b1', '["diction","adjective"]', 'The adjective form should describe the lecture, not reaction'),
    ('diction', 'much', 'She does not have much opportunities in this region.', 'much', 'many', 'error', '["error","valid"]', 3, 'b1', '["diction","quantifier"]', 'Count noun requires many'),
    ('diction', 'between', 'The final agreement was reached between the two teams.', 'between', NULL, 'valid', '["error","valid"]', 2, 'a2', '["diction","preposition"]', 'Preposition usage is correct'),
    ('diction', 'good', 'He speaks English very good now.', 'good', 'well', 'error', '["error","valid"]', 2, 'a2', '["diction","adverb"]', 'Adverb form is needed after speaks'),
    ('diction', 'influence', 'Social media can influence how people form opinions.', 'influence', NULL, 'valid', '["error","valid"]', 3, 'b1', '["diction","verb"]', 'Verb choice and structure are correct'),
    ('diction', 'despite', 'Despite of the rain, the event continued as planned.', 'despite', 'despite', 'error', '["error","valid"]', 4, 'b2', '["diction","preposition"]', 'Despite should not be followed by of'),
    ('diction', 'affect', 'New policies may affect small businesses first.', 'affect', NULL, 'valid', '["error","valid"]', 4, 'b2', '["diction","word-choice"]', 'Affect is correctly used as a verb'),
    ('diction', 'less', 'The project now needs less people than before.', 'less', 'fewer', 'error', '["error","valid"]', 3, 'b1', '["diction","quantifier"]', 'Count noun people takes fewer'),
    ('diction', 'in', 'She is interested in learning data science.', 'in', NULL, 'valid', '["error","valid"]', 2, 'a2', '["diction","collocation"]', 'Interested in is the correct collocation'),
    ('diction', 'advices', 'She gave me useful advices before the interview.', 'advices', 'advice', 'error', '["error","valid"]', 3, 'b1', '["diction","noun-form"]', 'Advice is uncountable in this use'),
    ('diction', 'among', 'Among all options, this one is the most feasible.', 'Among', NULL, 'valid', '["error","valid"]', 4, 'b2', '["diction","preposition"]', 'Among is correctly used with plural set'),
    ('diction', 'equipments', 'The lab bought new equipments for the course.', 'equipments', 'equipment', 'error', '["error","valid"]', 4, 'b2', '["diction","noun-form"]', 'Equipment is uncountable in standard usage'),
    ('diction', 'justify', 'You must justify your claim with clear evidence.', 'justify', NULL, 'valid', '["error","valid"]', 3, 'b1', '["diction","verb"]', 'Verb and preposition pattern are appropriate'),
    ('diction', 'listen', 'I always listen music while studying.', 'listen', 'listen to', 'error', '["error","valid"]', 2, 'a2', '["diction","collocation"]', 'Listen requires to before object'),
    ('diction', 'valuable', 'Their feedback was valuable for improving the report.', 'valuable', NULL, 'valid', '["error","valid"]', 3, 'b1', '["diction","adjective"]', 'Adjective choice is natural and correct'),
    ('diction', 'borrow', 'Can you borrow me your charger for a minute?', 'borrow', 'lend', 'error', '["error","valid"]', 3, 'b1', '["diction","word-choice"]', 'Borrow/lend direction is incorrect'),
    ('diction', 'concise', 'A concise summary is easier for readers to follow.', 'concise', NULL, 'valid', '["error","valid"]', 4, 'b2', '["diction","adjective"]', 'Word choice is accurate for context'),
    ('diction', 'much', 'There was much noise outside the building.', 'much', NULL, 'valid', '["error","valid"]', 2, 'a2', '["diction","quantifier"]', 'Noise is uncountable, so much is valid')
) AS seed(
  mode,
  prompt_word,
  context_sentence,
  highlighted_word,
  correction_word,
  correct_option,
  options_json,
  difficulty_level,
  cefr_level,
  tags,
  notes
)
WHERE NOT EXISTS (
  SELECT 1
  FROM vocab_game_items
  WHERE mode = 'diction'
);
