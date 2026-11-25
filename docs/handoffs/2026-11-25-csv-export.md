# Handoff 2026-11-25: CSV export of movements (plan 0001, task 02)

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
- Orchestrator decisions: amounts exported positive with a "Tipo" column; leading apostrophe against
  formula injection (cosmetic cost: Excel shows it literally for concepts starting with = + - @);
  category in the file name when a category filter is active.

## Fix round 1
- "Exportar mes" is disabled unless the loaded rows belong to the month on screen and there is no
  load error (`loadedMonth` + `canExportMonth`), so a month never saves under another month's name.
- With a category filter the button reads "Exportar mes (categoría)" and the file is
  `movimientos-2027-11-supermercado.csv` (`slugify`, `monthCsvFilename`).
- Search paging extracted to `fetchAllSearchRows`; unit tests for paging, a failing page,
  `canExportMonth`, file names, and `+` / `-` formula defusing in a full row.
- `searchMovements` does not expose `pageSize`, so the 50-per-request paging stays.
- Handoff renamed to today's date.
