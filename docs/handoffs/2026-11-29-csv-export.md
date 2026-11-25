# Handoff 2026-11-29: CSV export of movements (plan 0001, task 02)

Branch `agent/0001/02-csv-export` (from `integration/0001-polish`).

## Done
- "Exportar mes" / "Exportar resultados" button on the movements screen. The month export is what
  is on screen (honours the category filter); the search export pages through the existing
  `/api/movements/search` until every result is fetched. No server change.
- `src/web/movementsCsv.ts`: `;` separator, `dd/mm/yyyy`, `1.234,56` from integer cents, CRLF,
  UTF-8 BOM, quoting of `;` `"` newlines, apostrophe prefix against spreadsheet formulas
  (`=+-@` at the start of text cells). Blob download in the browser.
- Tests: unit (negatives, thousands, quoting, empty list) and e2e (month and 53 results over 2 pages).
- Glossary: Exportar mes / Exportar resultados.

## Not done
- The `reviewer` subagent could not be run from this session; the orchestrator runs it.
- Manual check in Excel (Windows) is Manuel's acceptance step.

## Decisions taken
- Amounts keep the stored positive value; the `Tipo` column says income/expense/repayment.
- Linked views (debt / fixed item) have no export button (out of scope).
