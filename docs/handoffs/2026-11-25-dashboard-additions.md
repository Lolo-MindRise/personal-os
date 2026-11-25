# Handoff 2026-11-25: Dashboard additions (plan 0002, task 05)

Branch `agent/0002/05-dashboard-additions` (from `integration/0002-insights-and-accounts`).

## Done
- Inicio shows "Cuentas" (one line per account with its balance, each linking to Cuentas; always
  shown, even with only Principal) and "Próximos 30 días" (pending fixed items and milestones, linking
  to Fijos and Hitos).
- Additive `DashboardDto` fields: `accounts` (`accountId`, `name`, `balanceCents`) and `next30Days`
  (`from`, `to`, `fixed`, `milestones`). Existing fields unchanged.
- Balances: `accountBalances(db)` extracted from the `GET /api/accounts/balances` handler in
  `accountsApi.ts` (same code, now shared); it calls the pure `accountBalance`. Not re-implemented.
- Pure helpers in `src/shared/dashboard.ts`: `addDays`, `next30DaysWindow`, `windowMonths`, `inWindow`.
- Tests: helpers (month, year, leap-day wrap), API (window boundaries, year wrap, confirmed items
  left out, transfer moves only `accounts`, empty DB), component, e2e (clock fixed to 2026-01-15).
- Glossary: "Próximos 30 días".

## Decisions taken
- Window = `today` to `today + 30`, both included, `today` being the page's own date.
- Only not-yet-past items: pending fixed items dated before `today` and overdue milestones are not
  in this block (overdue milestones still show under "Próximos hitos"). Done milestones and skipped
  or confirmed fixed items are left out.
- The window may touch three months (e.g. 31 January); `dueEntries` is called per month.
- `src/server/transfersApi.test.ts` invariant snapshot now drops `dashboard.accounts` (a transfer
  legitimately moves it); every other dashboard field is still asserted unchanged.
- No new API client method: the data comes inside the dashboard response.

## Open
- Reviewer not run by me; the orchestrator runs it.

## Next step
- Merge into the integration branch after review.
