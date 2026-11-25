# Task 0003-01: Trash, core (soft delete and exclusions)

**Branch:** `agent/0003/01-trash-core`
**ADRs:** 0002 (money in cents), migration rules in CLAUDE.md; plan `docs/plans/0003-data-safety-and-daily-use.md`
**Depends on:** 00 merged. Owns the migration slot (next is 0009).
**Touches:** `src/server/db/schema.ts`, one additive migration, `src/server/api.ts` and every server module that reads `movements` or `transfers` (at least: `apiCommon.ts`, `accountsApi.ts`, `transfersApi.ts`, `budgetApi.ts`, `dashboardApi.ts`, `debtsApi.ts`, `importApi.ts`, `monthSummary.ts`, `movementSearchApi.ts`, `projectionApi.ts`, `reportsApi.ts`, `summaryApi.ts`, `db/recurring.ts`, `recurringApi.ts`, goals/milestones code if it reads movements; find them all with grep), the data export/import files (`dataTables.ts`, `dataExportApi.ts`, `dataImportApi.ts`, `shared/dataFile.ts`), `src/shared/` types, `src/web/api.ts` (client methods only), tests. UI work is task 03: keep web changes to the minimum the types need.

## Goal

Deleting a movement or a transfer must be recoverable: the row is kept with
a deletion date and behaves as if it did not exist everywhere, until
Manuel restores it or deletes it permanently.

## Scope

1. **Additive migration**: a nullable `deleted_at` (ISO timestamp) on
   `movements` and on `transfers`, plus an index if useful. Hand-review the
   SQL (no DROP TABLE, no rebuild; see CLAUDE.md and the style of 0006-0008)
   and add a test that existing rows survive with `deleted_at` NULL.
2. **Soft delete**: `DELETE /api/movements/:id` and
   `DELETE /api/transfers/:id` set `deleted_at` instead of removing the row.
   New endpoints: list the trash (movements and transfers with their
   deletion date); restore one; delete one permanently (hard delete, one at a
   time, only for rows already in the trash). **Nothing is ever deleted
   automatically.**
3. **Exclusion everywhere**: rows with `deleted_at` are excluded from every
   list, total, balance, budget, report, projection, dashboard figure
   (including month-over-month and the new accounts/next-30-days blocks),
   year summary, goals, debt estimates, tag filters and counts, search,
   CSV import duplicate check, recurring pending/confirmed logic, and any
   other read. Do it centrally (one helper or view used by all readers) so a
   future reader cannot forget it, and grep for every read of the two tables
   to be sure.
4. **Required test (list it in the PR):** with one deleted movement and one
   deleted transfer present, **every endpoint that returns a list, a total
   or a balance gives exactly the same result as without them**. Build it
   as a table of endpoints (compare each response before and after the
   deletion, and against a database that never had the rows), and list the
   endpoints covered in the PR description. A test must fail if a reader
   forgets the exclusion (prove it by temporarily breaking one).
5. **Interactions to decide conservatively and record in the handoff:**
   - The unique index `movements_recurring_item_month_unique` (recurring
     item, month): a trashed confirmed movement must not make the fixed item
     look confirmed (it becomes pending again). Decide how re-confirming
     works while the trashed one still exists (e.g. the confirm path
     permanently clears nothing: refuse restore of the old one when a newer
     one occupies the slot, with a clear Spanish message) and test both
     orders.
   - Restoring a movement whose category, account or debt is gone or
     mismatched: refuse with a clear message, never half-restore.
   - Account or category deletion rules keep counting trashed rows as "in
     use" (conservative: protects restore). Say so.
   - The full data export (JSON) **keeps** trashed rows with their deletion
     date so moving to a new installation is lossless; the importer accepts
     files without the new column (older exports, `deleted_at` null). Keep
     the round-trip test identical row by row. (The CSV export is built from
     the lists and therefore excludes trashed rows.) This is an orchestrator
     decision; record it.
6. Labels and error messages in Spanish per `docs/ui-glossary.md`; add the
   terms `papelera`, `eliminado` and `restaurar` to the glossary first.

## Out of scope

The undo toast and the Papelera screen (task 03), reconciliation, any change
to how totals are calculated beyond excluding deleted rows, new dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.
- The endpoint-equivalence test exists, lists its endpoints, and fails when an exclusion is removed.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
