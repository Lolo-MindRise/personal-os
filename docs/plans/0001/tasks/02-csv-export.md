# Task 0001-02: Export movements to CSV

**Branch:** `agent/0001/02-csv-export`
**ADRs:** 0002 (stack, money as integer cents); plan `docs/plans/0001-polish.md`
**Depends on:** 01 (both change the movements screen header and search state; start only after 01 is merged into integration)
**Touches:** `src/web/MovementsPage.tsx`, a new pure helper under `src/web/` (or `src/shared/`), its unit tests, an e2e test.

## Goal

From the movements screen, export the current month or the current search
results as a CSV file that opens correctly in Spanish-locale Excel.

## Scope

1. An "Exportar" control on the movements screen offering the current month
   or, when a search is active, the current search results (all of them, not
   only the loaded page).
2. Spanish format: `;` separator, dates `dd/mm/yyyy`, amounts `1.234,56`
   (converted from integer cents without floats), header row, correct quoting
   of `;`, `"` and newlines in concepts. UTF-8 with BOM so Excel reads accents.
3. Generated in the browser (Blob download). Nothing written on the server;
   no new endpoint unless existing ones cannot return all search results, in
   which case page through the existing one.
4. Labels follow `docs/ui-glossary.md` (movimiento, concepto, importe,
   categoría). Add a glossary line if a new concept is needed.
5. Unit tests of the formatter (negatives, thousands, quoting, empty list);
   an e2e test that downloads and checks content.

## Out of scope

Importing, server changes beyond reuse of existing APIs, new dependencies.

## Manual test

Open a month export in Excel (Windows): columns, dates and amounts correct.
This is Manuel's acceptance check, not a blocker for CI.

## Done when

- Both CI jobs pass on the PR.
- Both reviewer verdicts are in the PR, with blockers and majors fixed or
  explained.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
