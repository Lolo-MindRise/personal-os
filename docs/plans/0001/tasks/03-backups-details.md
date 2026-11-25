# Task 0001-03: Backups screen details

**Branch:** `agent/0001/03-backups-details`
**ADRs:** 0002; the backup retention ADR/task 0012; plan `docs/plans/0001-polish.md`
**Depends on:** none
**Touches:** `src/web/BackupsPage.tsx`, its types in `src/shared/api.ts` if `/api/backups/status` lacks fields, `src/server/backups.ts` / `retention.ts` only to expose existing data read-only, tests.

## Goal

The read-only "Copias" screen shows more of what `/api/backups/status`
knows, so Manuel can tell at a glance whether backups are healthy.

## Scope

1. Show the retention tiers (as defined by the retention policy), the oldest
   restorable date and the mirror state, all from `/api/backups/status`.
   The oldest restorable date must match what `restore.sh` lists.
2. A short "cómo restaurar" explanation pointing to the README section on
   restore (read the README; do not duplicate its steps).
3. Spanish (es-ES) copy following `docs/ui-glossary.md`; add glossary lines
   for new concepts first.
4. Screen stays read-only. No restore action in the UI.
5. Tests: component/unit tests with fixture status payloads (mirror ok,
   mirror unavailable, no backups yet); API test if the endpoint changes
   (additive fields only).

## Out of scope

Changing the retention policy, `restore.sh`, real data or backups, new
dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR.
- Both reviewer verdicts are in the PR, with blockers and majors fixed or
  explained.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
