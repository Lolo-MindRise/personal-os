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
