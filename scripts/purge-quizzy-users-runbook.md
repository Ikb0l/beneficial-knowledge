# Quizzy Dummy User Purge Runbook

This runbook removes smoke-test accounts created by `scripts/tournament-e2e-smoke.mjs`.

## Scope

Target users are selected by SQL as:

- `users.custom_id LIKE 'quizzy_%'`
- `gamesPlayed = 0` in `storage(player_data/global_mmr)`
- no rows in `tournament_participants`

## Commands

Dry-run (recommended first):

```bash
SSHPASS='YOUR_SSH_PASSWORD' \
SUDO_PASS='YOUR_SSH_PASSWORD' \
bash scripts/purge-quizzy-users.sh \
  --host 46.8.176.30 \
  --user quizup \
  --mode dry-run
```

Apply:

```bash
SSHPASS='YOUR_SSH_PASSWORD' \
SUDO_PASS='YOUR_SSH_PASSWORD' \
bash scripts/purge-quizzy-users.sh \
  --host 46.8.176.30 \
  --user quizup \
  --mode apply
```

## What Apply Does

1. Creates backup tables in `cleanup_backup`:
- `quizzy_users_<suffix>`
- `quizzy_storage_<suffix>`
- `quizzy_leaderboard_record_<suffix>`
- `quizzy_notification_<suffix>`
- `quizzy_notifications_<suffix>`
2. Deletes from:
- `leaderboard_record` (by `owner_id`)
- `notifications` (custom app table)
- `users` (cascades to `storage`, `notification`, etc.)
3. Runs post-delete verification queries and fails if leftovers exist.

## Rollback (if needed)

Use the suffix printed by the apply run, then run on VPS Postgres:

```sql
BEGIN;
INSERT INTO users SELECT * FROM cleanup_backup.quizzy_users_<suffix>;
INSERT INTO storage SELECT * FROM cleanup_backup.quizzy_storage_<suffix>;
INSERT INTO leaderboard_record SELECT * FROM cleanup_backup.quizzy_leaderboard_record_<suffix>;
INSERT INTO notification SELECT * FROM cleanup_backup.quizzy_notification_<suffix>;
INSERT INTO notifications SELECT * FROM cleanup_backup.quizzy_notifications_<suffix>;
COMMIT;
```

If duplicates appear during rollback, insert in the required order and handle conflicts with `ON CONFLICT DO NOTHING` where appropriate.
