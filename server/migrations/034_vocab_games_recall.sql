-- Extend vocabulary mini-games with Recall mode.

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
    ('recall', 'president', 'head of state or appointed leader', 'president', '[]', 3, 'b1', '["recall","noun"]', 'Government vocabulary baseline'),
    ('recall', 'allocate', 'to assign resources for a specific purpose', 'allocate', '[]', 4, 'b2', '["recall","verb"]', 'Academic resource planning term'),
    ('recall', 'resilient', 'able to recover quickly from setbacks', 'resilient', '[]', 4, 'b2', '["recall","adjective"]', 'Character strength vocabulary'),
    ('recall', 'meticulous', 'showing great attention to detail', 'meticulous', '[]', 5, 'c1', '["recall","adjective"]', 'Precision-focused adjective'),
    ('recall', 'feasible', 'possible and practical to do successfully', 'feasible', '[]', 5, 'c1', '["recall","adjective"]', 'Decision making context'),
    ('recall', 'convey', 'to communicate or make known clearly', 'convey', '[]', 4, 'b2', '["recall","verb"]', 'Communication verb'),
    ('recall', 'diminish', 'to become or make something smaller', 'diminish', '[]', 4, 'b2', '["recall","verb"]', 'Change in magnitude'),
    ('recall', 'coherent', 'logical and consistent in structure', 'coherent', '[]', 4, 'b2', '["recall","adjective"]', 'Essay organization term'),
    ('recall', 'reluctant', 'unwilling or hesitant to do something', 'reluctant', '[]', 3, 'b1', '["recall","adjective"]', 'Behavioral descriptor'),
    ('recall', 'enhance', 'to improve the quality or value of something', 'enhance', '[]', 3, 'b1', '["recall","verb"]', 'Improvement verb'),
    ('recall', 'withstand', 'to resist force or difficult conditions', 'withstand', '[]', 4, 'b2', '["recall","verb"]', 'Engineering context'),
    ('recall', 'acquire', 'to gain possession of or learn', 'acquire', '[]', 3, 'b1', '["recall","verb"]', 'Learning and ownership'),
    ('recall', 'inevitable', 'certain to happen and unavoidable', 'inevitable', '[]', 5, 'c1', '["recall","adjective"]', 'Certainty cue'),
    ('recall', 'abundant', 'existing in large quantities', 'abundant', '[]', 3, 'b1', '["recall","adjective"]', 'Quantity descriptor'),
    ('recall', 'concise', 'brief but containing key information', 'concise', '[]', 3, 'b1', '["recall","adjective"]', 'Writing quality adjective'),
    ('recall', 'hinder', 'to make progress difficult', 'hinder', '[]', 4, 'b2', '["recall","verb"]', 'Obstacle verb'),
    ('recall', 'justify', 'to show a reason that explains a decision', 'justify', '[]', 4, 'b2', '["recall","verb"]', 'Argumentation verb'),
    ('recall', 'adapt', 'to adjust successfully to new conditions', 'adapt', '[]', 2, 'a2', '["recall","verb"]', 'Transition verb'),
    ('recall', 'negotiate', 'to discuss in order to reach agreement', 'negotiate', '[]', 4, 'b2', '["recall","verb"]', 'Conflict resolution term'),
    ('recall', 'inspire', 'to fill someone with motivation or confidence', 'inspire', '[]', 3, 'b1', '["recall","verb"]', 'Motivation verb')
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
  WHERE mode = 'recall'
);
