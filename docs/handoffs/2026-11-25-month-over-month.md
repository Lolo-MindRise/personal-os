# Handoff: month-over-month on Inicio (task 0001-04)

## Done
- Pure helpers in `src/shared/dashboard.ts`: `previousMonth`, `monthEnd`, `monthChangeText`
  (cents) and `monthChangePointsText` (percentage points).
- Additive `keyFigures.previous` in the dashboard API with the four previous values; null when
  there is no previous data.
- Inicio shows the change under all four key figures: Ahorro acumulado, Próximo objetivo
  (points), Deuda total estimada, Ahorro previsto del mes. No colours, no judgement.
- Debt: `totalDebtAt(db, cutoff)` in `debtsApi.ts` replays `estimateDebt` with events up to the
  cutoff. Goal: `goalProgress` of the same goal (the current "next goal") over `accumulatedAt`
  at the cutoff.
- Tests: unit (incl. January/December), API (debt/goal cut-off, February/March), component, e2e.
- Glossary: three lines for the change wording.

## Decisions
- "Previous month" for debt and goal = month before the selected one, cut off at its last day.
- Goal change in percentage points, for the same goal as the current next goal.
- No previous data: show nothing, applied to every figure. Debt: null if there are no debts or
  any debt's balance date is after the cutoff. Accumulated: null with no initial balance and no
  movement up to the cutoff. Projected: null when the previous month has no entries.
- Current debt and goal are today-based (as before); only the previous value is cut off.
- Orchestrator decision (review round 2): `previous.totalDebtCents` and
  `previous.goalProgressPercent` are null unless the selected month is the month of `today`, so
  the UI shows no debt/goal change line for past or future months. Savings work for any month.
- Goal change uses the rounded-down `progressPercent`, so points can differ by one from exact.
- One debt with a balance dated after the cutoff hides the change line for the whole debt total.

## Next
- Orchestrator runs the reviewer.
