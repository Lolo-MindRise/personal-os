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
- Reviewer not run by me; the orchestrator runs it.

## Fix round 1
- Migration 0006 (task 01, integration branch only) now dates Principal the day before the
  earliest movement (`date(min(date), '-1 day')`, else 2025-12-31): its balance includes every
  existing movement. Data-only change; journal and snapshot untouched, 0007 still applies. Test
  with movements on the first day added.
- A transfer dated on or before either account's opening date is refused (create and update, field
  `date`, Spanish message naming the account), mirrored in the form (`transferDateError`).
- Account-not-found errors map to `fromAccountId` / `toAccountId`. "Eliminar" hidden for Principal.
- Label "Fecha del saldo inicial de la cuenta"; glossary has it and origin/destination accounts.
- Known limit, follow-up: a movement dated before an account's opening date (backdated entry or
  imported older history) is still left out of the balance without warning. Follow-up: show a
  count of excluded movements.

## Fix round 2
- Merged integration (tasks 00-02); api.ts import conflict kept both imports.
- A new account's opening date defaults to yesterday (`yesterdayISO`, local), with a hint: the
  opening balance holds at the end of that day, movements and transfers count from the next day.
  Transfer account selectors show each account's opening date. Form test and e2e step use the
  defaults (account created, transfer dated today into it succeeds).
- PATCH /api/accounts/:id refuses an `openingBalanceDate` on or after any of its transfers (either
  side), field error on `openingBalanceDate` naming the first offending date; API tests; the form
  already maps it to the opening-date field.
- `checkTransfer` loads each account once. Navigation e2e lists Informes and Cuentas.
- Note for the final PR: databases already migrated with the old migration 0006 (dev/test
  databases created from the integration branch) keep Principal dated on its first movement and
  must be recreated. 0006 never reached main, so the real instance is unaffected.

## Next step
- Task 05 (dashboard balances) can use `GET /api/accounts/balances`.
