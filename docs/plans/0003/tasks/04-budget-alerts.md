# Task 0003-04: Budget alerts

**Branch:** `agent/0003/04-budget-alerts`
**ADRs:** 0002 (money in cents); plan `docs/plans/0003-data-safety-and-daily-use.md`
**Depends on:** 01 merged (exclusion of deleted rows in budget and dashboard readers). Can run in parallel with 03.
**Touches:** `src/web/DashboardPage.tsx`, `src/server/dashboardApi.ts` (additive fields), `src/web/BudgetPage.tsx`, `src/shared/budget.ts` or `src/shared/dashboard.ts` (pure helper), `docs/ui-glossary.md`, tests. No schema or migration.

## Goal

Warn, without nagging, when a category's spending nears or passes its
monthly budget.

## Scope

1. A pure, tested helper in `src/shared/`: given budget and actual cents
   (integers, no floats), returns the state `ok` (< 80 %), `warning`
   (>= 80 % and < 100 %) or `over` (>= 100 %) and the percentage (rounded
   down to an integer). Edge cases: budget 0 or missing (no alert), actual 0,
   exactly 80 % and exactly 100 %.
2. Inicio lists the **current month's** categories at or above 80 % and
   100 % of their budget, grouped or marked by state, each linking to its
   filtered movements (category + month, existing URL filters). The month is
   the selected one if the dashboard has a month selector, otherwise the
   current month; use the page's own `today` as the dashboard already does.
   Neutral wording, no blame ("Supermercado: 85 % del presupuesto"). Hidden
   section or friendly empty line when nothing is at 80 %.
3. Presupuesto shows a progress bar per category with the same thresholds
   (use text and shape as well as colour; accessible name with the
   percentage; the bar caps visually at 100 % but the number can exceed it).
4. Uses the existing budget "actual" definition (do not change how actuals
   are calculated; reuse the budget API's figures so Inicio, Presupuesto and
   the movements screen agree).
5. Additive API fields only; existing dashboard fields unchanged.
6. Tests: helper unit tests; API test (a category at 85 % appears, at 79 %
   does not, at 100 % marked over, no budget not listed); component/e2e test
   with the clock pinned (acceptance: a category at 85 % appears on Inicio).

## Out of scope

Notifications, emails, changing budget calculations, new dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
