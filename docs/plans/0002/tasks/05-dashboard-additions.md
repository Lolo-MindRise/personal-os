# Task 0002-05: Dashboard additions

**Branch:** `agent/0002/05-dashboard-additions`
**ADRs:** 0002; plan `docs/plans/0002-insights-and-accounts.md`
**Depends on:** 03 merged (account balances). Can run in parallel with 04.
**Touches:** `src/web/DashboardPage.tsx`, `src/server/dashboardApi.ts` (additive fields), `src/shared/dashboard.ts`/`api.ts`, `docs/ui-glossary.md`, tests. No schema or migration.

## Goal

Inicio shows account balances and what is due in the next 30 days.

## Scope

1. Account balances on Inicio (use the balance function from task 03; one
   line per account, linking to the Cuentas screen). Hidden when there is
   only the default account and no transfers? Conservative choice: always
   show it, even with one account.
2. "Próximos 30 días": fixed items (pending or expected) and milestones due
   within the next 30 days counted from the page's own `today` (the page
   already sends it), each linking to its screen (Fijos, Hitos).
3. Additive API fields only; the existing key figures and totals do not
   change (assert with tests that transfers do not change them).
4. Empty states in Spanish, labels per the glossary.
5. Tests: pure helper for the 30-day window (boundaries, month and year
   wrap), API test, e2e/component test with fixture data. Pin `today` in
   tests.

## Out of scope

Changing the month-over-month lines, calculations, new dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
