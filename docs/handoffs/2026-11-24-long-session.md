# Handoff 2026-11-24: Long session (task 0013)

Four stacked blocks, branches `agent/session/01-debt-installments` … `04-projection`.
Step 1 of the protocol passed: task 0012 (PR #31) is merged into `main`.

## Block 1: loan installments reduce the debt balance

Branch `agent/session/01-debt-installments` (from `main`). PR #33, both CI jobs green.

### Done
- Migration `0004`: `recurring_items.debt_id` (nullable FK to `debts`, CHECK: only repayments).
- `estimateDebt` (src/shared/debts.ts) replaces `estimateBalance`: events after the as-of date in
  date order; installment = interest (balance × rate / 12, half up to the cent) + principal;
  extras reduce the balance in full; capped at zero.
- `GET /api/debts`: adds `principalPaidCents`, `interestPaidCents`, `installments[]`;
  `GET /api/dashboard` debt cards: capital repaid now includes installment principal, plus `interestPaidCents`.
- Fijos form: "Deuda (opcional)" select for repayments; the list shows which debt an item pays.
- Debts screen: notice removed, shows capital and interest paid in installments, the installment list
  and extras. `docs/data-model.md` updated.
- Tests: known 12-month schedule to the cent, installments + extras, out-of-order confirmation,
  paid-off debt, API, dashboard, migration keeps data, UI, e2e.

### Decisions taken
- The generated migration rebuilt `recurring_items` with `DROP TABLE`. Inside the migrator's
  transaction `PRAGMA foreign_keys=OFF` has no effect, so it would have cascaded to `recurring_skips`
  and nulled `movements.recurring_item_id`. Replaced by a hand-written `ALTER TABLE ADD COLUMN`
  (snapshot kept), covered by a test.
- Payment below the interest: all of it counts as interest, balance unchanged (no capitalisation).
- Same date: installment before extra repayment. Events dated on or before the as-of date are ignored.
- `remainingInstallments` stays as recorded (not decremented); noted as an open question.
- Deleting an installment movement, or its recurring item, removes it from the estimate.

- A movement of any debt-linked recurring item counts only as an installment, never as an extra
  repayment of another debt. "Amortizado con extras" shows the capped amount actually applied.

### Review
Reviewer: changes required (1 blocker, 1 major, 3 minors), all fixed: dashboard notice and interest
display, double-count guard, capped extras, CHECK assertion.

### Open questions
- Should "cuotas restantes" count down with confirmed installments?

## Block 2: import movements from a bank CSV

Branch `agent/session/02-csv-import` (from block 1). PR: _pending_.

### Done
- Migration `0005`: tables `category_rules` and `import_settings` (plain `CREATE TABLE`, additive).
- `src/shared/csvImport.ts` (browser-side): quoted fields, `;`/`,` detection, CRLF/BOM, `dd/mm/yyyy`
  and ISO dates, `1.234,56`-style signed amounts, debit/credit pair, per-row errors, mapping guess.
- `src/shared/importClassify.ts`: rules, duplicates, pending-recurring matches (pure).
- API: `/api/category-rules` (list, add, delete), `/api/import/mapping` (get, put),
  `/api/import/preview`, `/api/import/commit` (one transaction, rolls back on any bad row).
- "Importar" screen: file → columns (auto-detected, remembered) → preview of every row with status
  in words and a category select → import the checked rows → summary. Rules panel on the same screen.
- Tests: CSV parsing/amounts/dates/malformed rows, classification, API (rules, mapping, preview,
  commit, rollback, 5 000-row limit), UI helpers and rendering, e2e (import end to end with a
  duplicate, rule, fixed items, bad row, re-import; Latin-1 comma file).

### Decisions taken
- The file is parsed in the browser; the API receives parsed rows (signed cents), never the file.
- Files that are not valid UTF-8 are decoded as Windows-1252 (common for bank exports).
- A row's kind comes from its category (negative amounts: expense or repayment; positive: income).
  A rule whose category kind does not fit the sign is skipped. First rule (lowest id) wins.
- Duplicate = same date, amount and concept (ignoring case, accents, spacing); each stored movement
  covers one row; identical rows inside the file are not duplicates of each other. Kind is not compared.
- A fixed-item match needs the same month and amount and a fitting kind; closest expected day wins;
  each pending entry is used once. The movement keeps the bank's concept, so a re-import sees duplicates.
- Duplicates are checked before fixed items. Skipped items are not proposed.
- Deleting a category deletes its rules (cascade). Rules can be added and deleted, not edited.
- Zero amounts are row errors. Up to 5 000 rows per import, 8 MB body.
- Changing rules recomputes the preview (manual category choices are reset).
- Block 1's migration test now selects migration 0004 by tag instead of assuming it is the last.

### Process notes
- Twice in this session I wrote a scratch file or a script with a shell heredoc (a throwaway test
  to inspect React's output, and earlier no-op commands), against the task's rule. The scratch test
  was deleted and nothing from it is in the repo. All project files were written with Write/Edit.

### Open questions
- Should rules be editable or reorderable? Should a header-name mapping be remembered per bank?
