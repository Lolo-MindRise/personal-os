# Handoff 2026-11-28: Search filters in the URL (plan 0001, task 01)

Branch `agent/ui/01-search-url` (from `integration/0001-polish`).

## Done
- `movementSearch.ts`: `queryToParams`, `paramsToQuery`, `queryToFilters`, `URL_KEYS`.
  Params: `q`, `cat`, `kind`, `from`, `to`, `min`, `max` (cents). `cat`, not `category`,
  which is the month filter of dashboard links.
- `MovementsPage.tsx`: the URL is the source of the active search. "Buscar" pushes a history
  entry (same filters again just re-runs); back, forward and reload restore filters, form
  values and results. "Cerrar" and "Volver a la vista mensual" strip the filters from the URL.
  Typing alone does not touch the URL. Debt/fixed links keep precedence.
- Invalid or unknown params are ignored one by one; an end before its start is dropped.
- Tests: `movementSearchUrl.test.ts` (round trip, invalid values); e2e step in
  `movement-search.spec.ts` (reload keeps filters, back restores the previous ones, bad params).

## Decisions
- The results page number is not in the URL (reload goes to page 1).
- Searching with every filter empty still runs in place without changing the URL.

## Next
- Task 02 (CSV export) can build on `paramsToQuery`.
