-- Extend vocabulary mini-games with Context mode.

ALTER TABLE vocab_game_items
  ADD COLUMN IF NOT EXISTS context_sentence TEXT;

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
      AND LOWER(BTRIM(correct_option)) IN ('valid', 'error')
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
    ('context', 'inspire', 'The most gifted actors have the ability to ____ the audience.', 'inspire', '["erase","inspire"]', 3, 'b1', '["context","verb"]', 'Sentence inference baseline'),
    ('context', 'negotiate', 'After weeks of conflict, both leaders agreed to ____ a fair contract.', 'negotiate', '["sprint","negotiate"]', 4, 'b2', '["context","verb"]', 'Conflict resolution clue'),
    ('context', 'resilient', 'Even after repeated setbacks, she remained ____ and focused.', 'resilient', '["resilient","fragile"]', 4, 'b2', '["context","adjective"]', 'Contrast with fragility'),
    ('context', 'concise', 'To keep the presentation clear, make your summary ____ and direct.', 'concise', '["verbose","concise"]', 3, 'b1', '["context","adjective"]', 'Communication precision'),
    ('context', 'hinder', 'Unclear regulations can ____ innovation in small companies.', 'hinder', '["hinder","accelerate"]', 4, 'b2', '["context","verb"]', 'Cause and effect'),
    ('context', 'abundant', 'After the heavy rains, freshwater became ____ across the region.', 'abundant', '["scarce","abundant"]', 3, 'b1', '["context","adjective"]', 'Resource availability'),
    ('context', 'inevitable', 'Given the evidence, a policy change now seems ____.', 'inevitable', '["optional","inevitable"]', 5, 'c1', '["context","adjective"]', 'Reasoning from certainty'),
    ('context', 'acquire', 'Students can ____ advanced vocabulary through daily reading.', 'acquire', '["discard","acquire"]', 3, 'b1', '["context","verb"]', 'Learning growth pattern'),
    ('context', 'reveal', 'The final chapter will ____ the source of the mystery.', 'reveal', '["conceal","reveal"]', 2, 'a2', '["context","verb"]', 'Narrative clue'),
    ('context', 'allocate', 'The committee decided to ____ additional funds to science programs.', 'allocate', '["waste","allocate"]', 4, 'b2', '["context","verb"]', 'Budgeting context'),
    ('context', 'meticulous', 'Because the experiment required precision, she stayed ____ with every measurement.', 'meticulous', '["careless","meticulous"]', 5, 'c1', '["context","adjective"]', 'Precision emphasis'),
    ('context', 'justify', 'You must ____ your answer using evidence from the passage.', 'justify', '["ignore","justify"]', 3, 'b1', '["context","verb"]', 'Academic instruction tone'),
    ('context', 'diminish', 'Without regular practice, pronunciation skills can quickly ____.', 'diminish', '["expand","diminish"]', 4, 'b2', '["context","verb"]', 'Skill decay cue'),
    ('context', 'coherent', 'Your essay is persuasive because each paragraph is logically ____.', 'coherent', '["coherent","random"]', 4, 'b2', '["context","adjective"]', 'Logical structure signal'),
    ('context', 'withstand', 'The bridge was engineered to ____ strong seasonal storms.', 'withstand', '["collapse","withstand"]', 3, 'b1', '["context","verb"]', 'Engineering context'),
    ('context', 'reluctant', 'He was ____ to speak publicly, so he declined the interview.', 'reluctant', '["eager","reluctant"]', 3, 'b1', '["context","adjective"]', 'Behavioral cue'),
    ('context', 'enhance', 'Adding examples can ____ the clarity of your explanation.', 'enhance', '["reduce","enhance"]', 2, 'a2', '["context","verb"]', 'Writing improvement cue'),
    ('context', 'convey', 'A strong headline should ____ the article''s main idea at once.', 'convey', '["convey","confuse"]', 4, 'b2', '["context","verb"]', 'Media literacy clue'),
    ('context', 'feasible', 'With the current budget, the expansion plan is not yet ____.', 'feasible', '["impossible","feasible"]', 5, 'c1', '["context","adjective"]', 'Constraint reasoning'),
    ('context', 'adapt', 'To succeed in a new environment, learners must quickly ____.', 'adapt', '["resist","adapt"]', 2, 'a2', '["context","verb"]', 'Adjustment context')
) AS seed(
  mode,
  prompt_word,
  context_sentence,
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
  WHERE mode = 'context'
);
