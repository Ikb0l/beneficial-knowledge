const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migrationsDir = path.resolve(__dirname, '../../migrations');
const migration024Path = path.join(migrationsDir, '024_tournament_integrity_hardening.sql');
const migration025Path = path.join(migrationsDir, '025_tournament_bot_participants.sql');
const migration012Path = path.join(migrationsDir, '012_tournament_ready_pause.sql');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('migration 024 includes reward idempotency and strict tournament integrity constraints', () => {
  const sql = read(migration024Path);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS tournament_reward_claims/i);
  assert.match(sql, /UNIQUE \(tournament_id, user_id, reward_key, reward_type\)/i);
  assert.match(sql, /CREATE TRIGGER trg_sync_tournament_registered_count/i);
  assert.match(sql, /CREATE TRIGGER trg_touch_tournament_match_activity/i);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_matches_slot/i);
  assert.match(sql, /tournament_matches_player1_same_tournament_fkey/i);
  assert.match(sql, /tournament_matches_player2_same_tournament_fkey/i);
  assert.match(sql, /tournament_matches_winner_same_tournament_fkey/i);
  assert.match(sql, /tournament_matches_winner_participant_check/i);
  assert.match(sql, /idx_notifications_tournament_event_unique/i);
  assert.match(sql, /AND \(data \? 'tournamentId'\)/i);
});

test('migration 012 uses dynamic status-check replacement to include paused safely', () => {
  const sql = read(migration012Path);

  assert.match(sql, /pg_get_constraintdef\(oid\) LIKE '%status%IN%'/i);
  assert.match(sql, /ALTER TABLE tournaments\s+ADD CONSTRAINT tournaments_status_check/i);
  assert.match(sql, /'paused'/i);
});

test('migration 025 adds tournament bot participants and policy controls', () => {
  const sql = read(migration025Path);

  assert.match(sql, /CREATE TABLE IF NOT EXISTS tournament_bot_profiles/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS bot_policy JSONB/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS is_bot BOOLEAN/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS bot_profile_id UUID/i);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS bot_influenced BOOLEAN/i);
  assert.match(sql, /ALTER COLUMN user_id DROP NOT NULL/i);
  assert.match(sql, /tournament_participants_human_or_bot_check/i);
  assert.match(sql, /is_bot = false AND user_id IS NOT NULL AND bot_profile_id IS NULL/i);
  assert.match(sql, /is_bot = true AND user_id IS NULL AND bot_profile_id IS NOT NULL/i);
  assert.match(sql, /idx_tournament_bot_profiles_active/i);
  assert.match(sql, /idx_tournament_participants_tournament_bot/i);
  assert.match(sql, /idx_tournament_participants_bot_profile/i);
  assert.match(sql, /bot_tournament_default_policy/i);
  assert.match(sql, /bot_tournament_difficulty_profile/i);
});
