# Handoff: month-over-month on Inicio (task 0001-04)

## Done
- `monthChangeText` and `previousMonth` (pure, integer cents) in `src/shared/dashboard.ts`.
- Additive `keyFigures.previous` in the dashboard API (accumulated and projected savings of the
  previous month; null when that month has no data).
- Inicio shows "+120,00 € respecto a diciembre" / "Sin cambios respecto a …" under
  Ahorro acumulado and Ahorro previsto del mes. No colours, no judgement.
- Tests: unit, API, component, e2e.

## Decisions
- No previous data: show nothing.
- Deuda total estimada and Próximo objetivo have no monthly history in the data model (the debt
  balance is computed as of now), so they show no change. Adding it needs a data-model change,
  out of scope.

## Next
- Orchestrator runs the reviewer.
