# Task 0003-00: Migration rehearsal script

**Branch:** `agent/0003/00-rehearse-migration`
**ADRs:** 0003 (environment), 0007 (real-instance operations); plan `docs/plans/0003-data-safety-and-daily-use.md`
**Depends on:** none (runs alone, first)
**Touches:** a new `scripts/rehearse-migration.sh` (and a helper under `scripts/lib/` if needed, following the existing pattern of `restore.sh` / `sqlite-tool.mjs`), its tests (like `src/server/restore.test.ts`), `README.md` (real-instance guide), a handoff. No schema, no app code.

## Goal

Let Manuel see, before deploying a build with migrations to the real
instance, what those migrations do to a copy of his data.

## Scope

1. `scripts/rehearse-migration.sh`: reads the instance configuration like
   `scripts/start.sh` (reuse `scripts/lib/common.sh`); takes the **newest
   local backup** (a consistent snapshot, never the live database; reuse the
   backup naming and listing logic of `restore.sh`) and copies it to a
   temporary directory.
2. Counts rows per table, applies the **current build's migrations to the
   copy** with the same migrator the app uses (no server needed), counts again.
3. Prints a table: table, rows before, rows after, difference; and the list
   of migrations applied. Exits non-zero if any table lost rows or a
   migration failed. Deletes the temporary copy unless `--keep` is given
   (then prints its path).
4. **Never opens the live database and never writes anywhere but the
   temporary directory.** Say so in the script header and test it (e.g. the
   live database file is byte-identical and untouched before and after).
5. Tests with **fixture backups and a temporary instance configuration
   only**: per-table counts printed; a fixture migration that deletes rows
   makes it fail; a failing migration makes it fail; `--keep` keeps the
   copy; no backup available gives a clear error.
6. README: a section "Rehearse a deployment" in the real-instance guide,
   placed before "Update after merging a PR".
7. Draft a short amendment for ADR-0007 (rehearsal mandatory for high-risk
   PRs that contain migrations) **inside the PR description, not in the ADR
   file**: Manuel decides.

## Out of scope

Running it against the real configuration (agents never do; the guard
blocks any direct invocation of the script; test it only through the test
suite with temporary directories), changing `deploy-local.sh`, new
dependencies, editing `.claude/` or ADR files.

## Manual test needed

Manuel runs `scripts/rehearse-migration.sh` against the real instance
configuration (Ubuntu) after merge: expect a table of counts with
differences 0 or positive and exit code 0. Write the exact steps and the
expected output in the PR.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
