# Handoff 2026-11-25: Transfers and Cuentas (plan 0002, task 03)

Branch `agent/0002/03-transfers-cuentas` (from `integration/0002-insights-and-accounts`).

## Done
- `transfers` table, migration `0007_brave_mysterio.sql`: a single CREATE TABLE plus three indexes
  (generated, reviewed, no DROP/rebuild). Both accounts are real foreign keys (a new table can
  have them), plus CHECKs: amount > 0 integer, accounts differ, date format.
- API: `GET/POST /api/transfers`, `PATCH/DELETE /api/transfers/:id` (`transfersApi.ts`, registered
  from `registerAccountsApi` so `api.ts` stays untouched). `GET /api/accounts/balances`,
  `DELETE /api/accounts/:id` (409 for Principal or an account with movements/transfers).
- `src/shared/accountBalance.ts`: pure `accountBalance`. Uses `savingsDelta` for the sign.
- Cuentas screen (`AccountsPage.tsx`, `accountForms.ts`) under Ajustes: balances, create/edit/delete
  account, register/edit/delete transfer. Glossary and data model updated.
- Tests: balance function, API, invariant (100 € transfer: balances move by exactly +-10000 and
  month summary, budget, projection, dashboard, year summary, movements are identical before,
  after edit and after delete), migration row survival, DB-level constraints, forms, e2e.

## Decisions taken
- Balance rule "dated after the opening date" matches the savings balance convention (the opening
  balance is valid at the end of its day). Applies to transfers too.
- Balances come from a separate endpoint; `AccountDto` is unchanged.
- `src/web/router.ts` got `'accounts'` in `VIEW_IDS` (needed for the route; App.tsx alone is not enough).

## Open
- Principal is dated on the earliest movement with balance 0, so with the "after" rule movements on
  that first day are not in its balance. Manuel may want to edit Principal's opening date/balance.
- Reviewer not run by me; the orchestrator runs it.

## Next step
- Task 05 (dashboard balances) can use `GET /api/accounts/balances`.
