-- Add IELTS competitive reading categories for QuizUp battles

INSERT INTO categories (category_key, name, icon, description, category_type, questions_per_match, time_per_question, is_active, display_order)
VALUES
  (
    'ielts_tfng',
    'IELTS True/False/NG',
    'book-open',
    'Read a short passage and decide: True, False, or Not Given. Fast competitive battles.',
    'normal',
    10,
    25,
    true,
    10
  ),
  (
    'ielts_ynng',
    'IELTS Yes/No/NG',
    'book-open',
    'Read the passage and decide: Yes, No, or Not Given. Writer''s claims.',
    'normal',
    10,
    25,
    true,
    11
  ),
  (
    'ielts_mcq',
    'IELTS Multiple Choice',
    'list',
    'Read the passage and pick the correct answer from 4 options.',
    'normal',
    10,
    30,
    true,
    12
  ),
  (
    'ielts_headings',
    'IELTS Heading Match',
    'align-left',
    'Match each paragraph to the best heading. Quick decisions!',
    'normal',
    5,
    35,
    true,
    13
  )
ON CONFLICT (category_key) DO UPDATE SET
  is_active = true,
  questions_per_match = EXCLUDED.questions_per_match,
  time_per_question = EXCLUDED.time_per_question;
