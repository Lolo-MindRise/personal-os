# Handoff 2026-11-24: Long session (task 0013)

Four stacked blocks, branches `agent/session/01-debt-installments` … `04-projection`.
Step 1 of the protocol passed: task 0012 (PR #31) is merged into `main`.

## Block 1: loan installments reduce the debt balance

Branch `agent/session/01-debt-installments` (from `main`). PR: _pending_.

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
