# Task 0012: Time-based backup retention and restore

**Branch:** `agent/implementer/backup-retention`
**ADRs:** 0001, 0002, 0003

## Goal

Manuel now has real data. Today's rotation keeps the newest N backups, and
every app start creates one, so a day of restarts can push out every backup
from earlier days. He must always be able to go back to yesterday, last
week or last month. A backup that has never been restored is not trusted,
so this task also adds a tested restore.

## Scope

### 1. Retention policy (replaces count-based rotation)

Applied after every backup, the same way locally and in the mirror:
- Keep every backup from the last 48 hours.
- Keep the newest backup of each calendar day for the last 60 days.
- Keep the newest backup of each calendar month, indefinitely.
- Always keep the 10 newest `-pre-migration` backups, whatever their age.
- Delete everything else. Never delete the backup just created.

Use the backup timestamps in the file names, not file modification times.
Days and months follow Manuel's local time zone (Europe/Andorra).

### 2. Status

`GET /api/backups/status` adds the oldest restorable date and the count per
tier (recent, daily, monthly, pre-migration), locally and in the mirror.
Update the UI banner logic only if a new warning is needed.

### 3. Restore script: `scripts/restore.sh`

- Lists available backups (local by default, `--mirror` for the mirror),
  newest first, with date and type.
- `scripts/restore.sh <backup file>` restores it into
  `PERSONAL_OS_DATA_DIR`, reading the instance config like `start.sh`.
- Refuses to run while the app is running.
- Before replacing the database, copies the current one to
  `<data dir>/backups/` with a `-before-restore` suffix (kept by the
  retention policy like pre-migration backups).
- Verifies the backup is a valid SQLite database (integrity check) before
  touching anything; aborts with a clear message if not.
- README: a short "Restore a backup" section.

### 4. Tests

- Retention: a fake clock across several months, many restarts in one day,
  day and month boundaries in Europe/Andorra (including a DST change),
  pre-migration and before-restore backups kept, the new backup never deleted.
- Restore: temporary directories only. Lists, restores, refuses while
  running, refuses a corrupt file, keeps a `-before-restore` copy.

### 5. Process

No new dependencies. Run the `reviewer` subagent before opening the PR and
add the review log row. Handoff in `docs/handoffs/`. Do not touch the real
instance, its data or its backups (the guard hook enforces this).

## Out of scope

Off-site backups, restore from the UI, data model changes.

## Done when

- Both CI jobs pass on the PR.
- The reviewer verdict is in the PR, with blockers and majors fixed or
  explained.
- The README lets Manuel restore a backup without asking anything.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
