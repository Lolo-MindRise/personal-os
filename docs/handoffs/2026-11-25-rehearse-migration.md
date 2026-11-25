# Handoff 2026-11-25: Migration rehearsal (plan 0003, task 00)

Branch `agent/0003/00-rehearse-migration` (from `integration/0003-data-safety-and-daily-use`).

## Done
- `scripts/rehearse-migration.sh`: reads the instance config (`common.sh`), takes the newest
  local backup (any type), checks it, copies it to `mktemp -d`, runs the helper, deletes the
  copy unless `--keep` (then prints the path). Never opens the live database; the only write
  is the temporary directory.
- `scripts/lib/rehearse-tool.mjs`: counts rows per table, applies `<app dir>/drizzle` with the
  same drizzle migrator the app uses, counts again, prints the table and the migrations applied.
  Exit 1 on a failed migration, a table with fewer rows or a table that disappeared.
- `scripts/lib/common.sh` now holds `BACKUP_NAME_RE` and `list_backups` (moved from
  `restore.sh`, which uses them unchanged; `restore.test.ts` still passes).
- README: step 7 "Rehearse a deployment" of the real-instance guide, before the update step.
- Tests `src/server/rehearseMigration.test.ts` (temp dirs, fixture migrations and backups):
  counts, none pending, real migrations, deleting/dropping/failing migrations, newest backup,
  copy deleted/kept, data folder byte-identical (content and mtime), no live database needed,
  no backup / no folder / corrupt backup / no config / unknown option.

## Decisions taken
- `__drizzle_migrations` is not in the table; the migrations list replaces it.
- A new table shows 0 before and "(new table)"; a removed table is a failure.
- Pending migrations are found with drizzle's own rule (journal `when` newer than the last applied).
- The script migrates the build in its own app directory, so it is run from the build to deploy.

## Not verified here
- Never run against the real configuration (Manuel, after merge: see the PR).
- The reviewer was not run by this agent; the orchestrator does it.
- ADR-0007 amendment is drafted in the PR description only.

## Next
- Manuel decides on the ADR-0007 amendment.

## Fix round 1 (reviewer: changes required, risk high)
- The script copies the backup (cp), checks the copy is identical (cmp) and runs the integrity
  check and the migration on the COPY only; the original is only read by cp/cmp (no -wal/-shm).
- New test: backup made like the app (WAL source + backup API), whole data dir fingerprinted
  before/after, no -shm/-wal in backups/. Not proven to fail on the old code (not run against it).
- rehearse-tool.mjs: no process.exit inside try (exitCode + return, copy always closed);
  pragmas journal_mode=WAL then foreign_keys=ON, as the app.
- README: row counts only, exact commands `git checkout main && git pull --ff-only && npm ci`,
  the --keep folder may hold -wal/-shm. `--help` prints line 11. Script mode is 100755.
- common.sh list_backups uses `LC_ALL=C sort -r`.
- PR text /tmp/pr-body-0003-00.md updated (file names checked in src/server/db/config.ts, backups.ts).

## Fix round 2 (CI failed: exit status 141)
- Root cause: `newest="$(list_backups ... | head -n 1)"` under `set -o pipefail`. head exits after
  the first line, the writer (list_backups) gets SIGPIPE on its next echo, the pipeline returns 141
  and `set -e` aborts with empty output. Timing-dependent (CI), so a real bug for Manuel too.
- Fix: `mapfile -t backup_names < <(list_backups ...)`, first element is the newest. common.sh has
  no early-closing reader; restore.sh reads the listing fully (while-read), so it is unaffected
  and unchanged.
- Test: 200 fixture backups plus a newer one, three runs, expects exit 0 and the newest name.
  Proven to fail (141) with `| head -n 1` reintroduced, pass with the fix; 6 repeated runs stable.
- Minors: cmp failure says the copy is not trustworthy and nothing was changed (new test with a
  stub cmp); long README line wrapped.
