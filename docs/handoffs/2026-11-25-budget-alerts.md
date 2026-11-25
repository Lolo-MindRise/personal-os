# Handoff 2026-11-25: Budget alerts (plan 0003, task 04)

Branch `agent/0003/04-budget-alerts` (from `integration/0003-data-safety-and-daily-use`).

## Done
- `src/shared/budget.ts`: `budgetAlert(budgetCents, actualCents)` -> `{ state, percent }`.
  `none` (no or zero budget), `ok` (< 80 %), `warning` (80-99 %), `over` (>= 100 %). Integer math,
  percent rounded down, can exceed 100, negative actuals count as 0.
- `GET /api/dashboard`: additive `budgetAlerts` (warning/over only, over first, then percent
  desc). Built from the existing `categories` block (budget API figures), so it already excludes
  trashed movements (`liveMovements`) and agrees with Presupuesto and the movements screen.
- Inicio: `BudgetAlerts` section "Presupuesto del mes", grouped "Presupuesto alcanzado o
  superado" / "Cerca del presupuesto", each link to `#/movements?category=..&month=..`. Uses the
  selected month (the page's own `today` decides the default). Hidden with no budget set; a
  friendly line when a budget exists but nothing is at 80 %.
- Presupuesto: `BudgetMeter` under the actual amount of each row with a budget: progressbar with
  accessible name "X: 85 % del presupuesto", state in words, striped when over, bar capped at 100 %.
- Glossary: cerca del presupuesto, presupuesto alcanzado o superado.
- Tests: helper unit, API (85 / 79 / 100 / no budget / deleted movement / other month), component
  (Inicio and meter), e2e `budget-alerts.spec.ts` (clock pinned to 2031-03-15).

## Notes
- No schema, migration or dependency. `DashboardCategoryDto.overBudget` (strictly > budget) is
  unchanged; the alert's `over` is >= 100 % by the brief.
- The e2e creates one movement in 2031-03 and deletes it (goes to the trash).

## Fix round 1
- e2e cleanup now also purges (`DELETE /api/trash/movements/:id`) and asserts both responses ok.
- Presupuesto: the meter and state words show only for `kind === 'expense'` rows (income and
  repayment rows look as before); test added.
- Deliberate difference, commented in `shared/budget.ts`, `dashboardApi.ts` and
  `DashboardCharts.tsx`: alert state `over` is >= 100 %, the chart flag `overBudget` is strictly
  above budget. Do not "fix" one to match the other.

## Next
- Reviewer run by the orchestrator.
