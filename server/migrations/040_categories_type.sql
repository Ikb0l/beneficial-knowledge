-- Add explicit category type for differentiated quiz limits.
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS category_type VARCHAR(16);

UPDATE categories
SET category_type = 'normal'
WHERE category_type IS NULL
   OR btrim(category_type) = ''
   OR category_type NOT IN ('normal', 'vocabulary');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'categories_category_type_check'
  ) THEN
    ALTER TABLE categories
      ADD CONSTRAINT categories_category_type_check
      CHECK (category_type IN ('normal', 'vocabulary'));
  END IF;
END
$$;

ALTER TABLE categories
  ALTER COLUMN category_type SET DEFAULT 'normal';

ALTER TABLE categories
  ALTER COLUMN category_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_categories_category_type_active_order
  ON categories (category_type, is_active, display_order)
  WHERE is_active = true;
