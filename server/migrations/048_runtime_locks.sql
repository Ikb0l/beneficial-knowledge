-- Runtime lease locks
-- Replaces PostgreSQL session advisory locks for Nakama RPC coordination.
-- Session advisory locks are unsafe with pooled SQL connections because the
-- unlock can run on a different backend from the lock acquisition.

CREATE TABLE IF NOT EXISTS runtime_locks (
    lock_key TEXT PRIMARY KEY,
    owner TEXT NOT NULL,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_locks_expires_at
    ON runtime_locks(expires_at);

