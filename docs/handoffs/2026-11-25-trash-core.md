# Handoff 2026-11-25: Trash, core (plan 0003, task 01)

Branch `agent/0003/01-trash-core` (from `integration/0003-data-safety-and-daily-use`).

## Done
- Migration `0009_trash`: only two ADD COLUMN, `deleted_at` (nullable text) on `movements` and
  `transfers`. The unique index `movements_recurring_item_month_unique` is untouched.
  `drizzle/meta` consistent (snapshot 0009 differs from 0008 only by the two columns).
- `src/server/db/live.ts`: `liveMovements()`, `liveTransfers()`, `trashedMovements()`,
  `trashedTransfers()`, `deletionTimestamp()`. The one place that defines "not in the trash".
- `DELETE /api/movements/:id`, `DELETE /api/transfers/:id` now soft delete. New `trashApi.ts`:
  `GET /api/trash`, `POST /api/trash/{movements,transfers}/:id/restore`,
  `DELETE /api/trash/{movements,transfers}/:id` (hard delete, only rows already trashed).
- Types `TrashDto`, `TrashedMovementDto`, `TrashedTransferDto`; client methods in `src/web/api.ts`.
- Glossary: papelera, eliminado, restaurar, eliminar definitivamente. Data-model "Trash" section.
- Tests: `trashEquivalence.test.ts` (endpoint table, 33 endpoints x 3 comparisons),
  `trashGuard.test.ts` (static: file importing the tables must use the helpers),
  `trashApi.test.ts` (behaviour), `db/trashMigration.test.ts` (row survival, full index kept),
  `dataTransfer.test.ts` (round trip with trashed rows, old file without `deletedAt`).
  Older migration tests now ignore the new `deleted_at` column (asserting it is NULL).

## Inventory: every read of `movements` / `transfers` in src/server (non-test)
Excluded with the helper (live only):
- `api.ts` GET /api/movements, PATCH lookup, DELETE (soft); `apiCommon.ts` `getMovement`
- `movementSearchApi.ts` (base condition; tag `exists` subquery hangs off the live outer row)
- `monthSummary.ts` (also used by dashboard and /api/months/:m/summary); `budgetApi.ts`;
  `reportsApi.ts`; `projectionApi.ts` (actuals); `summaryApi.ts` `allMovements` (year summary,
  goals, accumulated savings, dashboard months/goal progress/previous-month figures)
- `debtsApi.ts` x3 (installments, installment-id set, extra repayments) -> also `totalDebtAt`
- `importApi.ts` preview duplicate check (+ `dueEntries`/`confirmedItemIds` for pending logic)
- `db/recurring.ts` `confirmedItemIds` (pending/skipped/confirm/confirm-all/skip/import/projection)
- `dashboardApi.ts` setup flag `movements` (`liveMovementCount`); balances, next-30-days and
  accounts blocks via `accountsApi.accountBalances`
- `accountsApi.ts` balances (movements and transfers); account PATCH opening-date check (live
  transfers only; restore re-checks); `transfersApi.ts` list/get/PATCH/DELETE
- `tagsApi.ts` tag counts (join on live movements)
- `categoriesApi.ts` usage DTO counts live movements only
Counted on purpose, trash included (protects restore): account DELETE (also DB trigger),
category DELETE (`inTrash` check, message mentions the papelera).
Not reading for figures: `db/seed.ts`, `recurringApi.ts` (inserts), `dataExportApi.ts` and
`dataImportApi.ts` (generic over the schema, keep/restore trashed rows), `trashApi.ts`.
Goals/milestones code does not read movements (goals use `allMovements`).

## Decisions taken (conservative)
- Month slot: see "Fix round 1" (the trashed confirmation holds it; confirm paths refuse).
- Restore refused (409, "No se puede restaurar: ...", nothing changed) when category/kind,
  account or debt is gone, or a transfer date no longer follows the opening dates.
- Deleted-for-good is only possible from the trash; DELETE of a trashed row via the normal route is 404.
- JSON export keeps trashed rows with `deletedAt` (orchestrator decision); importer accepts older
  files without the key (`null`). `referenceProblems` slot uniqueness counts trashed rows.
  CSV export is built from the lists, so it excludes trashed rows.
- The tag list still shows a tag only used by trashed movements (count 0): tags are not movement data.
- `deleted_at` is not indexed (small data); add one if a screen ever filters on it heavily.

## Proof the equivalence test bites
Removing one exclusion each time made it fail: reportsApi (expense report), `accountBalances`
transfers filter (account balances + both dashboards), `confirmedItemIds` (month summary, pending,
dashboard, projection). Guard hook blocked `sed -i`, so mutations were made with Edit and reverted.

## Fix round 1 (reviewer: changes required)
- Migration 0009 is now purely additive: only the two `ALTER TABLE ... ADD deleted_at`. The full
  unique index stays. `trashMigration.test.ts` asserts the index exists, is not partial, still
  blocks a second row next to a trashed one, and that the SQL has no DROP/CREATE/RENAME.
- Slot decision (orchestrator): a trashed confirmation still holds the (item, month) slot.
  `confirmedItemIds` and pending stay live-only (the item shows as pending). New
  `trashedItemIds()` + `TRASH_HOLDS_SLOT` in `db/recurring.ts`. Single confirm (409), confirm-all
  (409 for the whole request, checked before the transaction, nothing written) and import commit
  (400 "Fila N: ...", inside the existing transaction, so no half import) refuse with "Hay un
  movimiento de este fijo en la papelera: restáuralo o elimínalo definitivamente." Restore no
  longer needs a slot check (a live one cannot exist); skip, category/kind, account, debt and
  transfer-date checks remain. `referenceProblems` counts trashed rows again for slot uniqueness.
  Tests: confirm, confirm-all (atomic), import commit (first test of that path), both orders,
  deleted-for-good then confirm. Two old `recurringApi.test.ts` tests and the e2e cleanups
  (`recurring.spec.ts`, `import.spec.ts`) now delete trashed movements for good.
- Account DELETE with only trashed rows answers "... hay movimientos o transferencias eliminados
  de esta cuenta en la papelera."
- `trashGuard.test.ts`: matches schema imports from any relative path and `schema.movements/
  transfers`; commented as a tripwire (the equivalence test is the real protection).
  `recurringApi.ts` stays exempt (it only inserts; it has no live helper to call).
- `deletedAt` in the data file must be ISO 8601 UTC (`...T..:..:..(.fff)Z`) or null; old files
  without the key still import.
- Known limits: DELETE /api/tags/:id cascades and removes the tag links of trashed movements too
  (a restore comes back without that tag; /api/tags shows a tag only used by trash with count 0).
  DELETE of a recurring item sets `recurring_item_id` NULL on trashed confirmations. "Restores
  exactly as it was" holds only when neither happened.

## Next
- Task 03 builds the undo toast and Papelera screen on the client methods and DTOs.
- The reviewer is run by the orchestrator, not by me.
