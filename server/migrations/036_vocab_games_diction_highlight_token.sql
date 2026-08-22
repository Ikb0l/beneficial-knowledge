-- Enforce diction highlighted token presence inside context sentence.

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
      AND POSITION(LOWER(BTRIM(highlighted_word)) IN LOWER(context_sentence)) > 0
      AND LOWER(BTRIM(correct_option)) IN ('valid', 'error')
      AND (
        LOWER(BTRIM(correct_option)) <> 'error'
        OR NULLIF(BTRIM(correction_word), '') IS NOT NULL
      )
    )
  );
