-- Ensure web nicknames are unique regardless of case, with safe dedupe
CREATE TABLE IF NOT EXISTS web_credentials_nickname_conflicts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  nickname VARCHAR(50) NOT NULL,
  conflict_group VARCHAR(50) NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

WITH ranked AS (
  SELECT
    id,
    user_id,
    nickname,
    LOWER(nickname) AS conflict_group,
    created_at,
    last_login_at,
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(nickname)
      ORDER BY COALESCE(last_login_at, created_at) DESC, created_at DESC
    ) AS rn
  FROM web_credentials
)
INSERT INTO web_credentials_nickname_conflicts (id, user_id, nickname, conflict_group, last_login_at, created_at)
SELECT id, user_id, nickname, conflict_group, last_login_at, created_at
FROM ranked
WHERE rn > 1
ON CONFLICT (id) DO NOTHING;

DELETE FROM web_credentials
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY LOWER(nickname)
      ORDER BY COALESCE(last_login_at, created_at) DESC, created_at DESC
    ) AS rn
    FROM web_credentials
  ) ranked
  WHERE rn > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_web_credentials_nickname_lower
  ON web_credentials (LOWER(nickname));
