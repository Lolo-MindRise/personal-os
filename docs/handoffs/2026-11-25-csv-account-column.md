# Handoff 2026-11-25: CSV export, account column (plan 0003, task 02)

Branch `agent/0003/02-csv-account-column` (from `integration/0003-data-safety-and-daily-use`).

## Done
- New last column "Cuenta" (after "Marcas") in the movements CSV. Existing columns and order unchanged.
- `movementsToCsv(movements, accounts)`: account name goes through `csvText` (quoting, apostrophe
  against formulas). Unknown account id gives an empty cell; no accounts given gives empty cells.
- `MovementsPage.tsx` export fetches `api.accounts()` at click time (existing endpoint), for both
  the month and the search export. A failing fetch shows the usual export error.
- Tests: unit (header, `=Banco`, `Caja; ahorro`, unknown id) and e2e (header and "Principal" value
  for the month and the search export).

## Not done
- The `reviewer` subagent was not run from this session; the orchestrator runs it.

## Fix round 1
- `movementsToCsv` `accounts` parameter is now required (no `[]` default); the compiler catches a
  missing argument. Existing unit tests pass `[]` explicitly.
- New e2e test: with `/api/accounts` answering 500 the export shows the error alert and produces no
  download. Proven to fail with a temporary `.catch(() => [])` on the fetch, then removed.

## Decisions taken
- Accounts fetched fresh at export time instead of reusing page state, so a failed or stale
  initial load cannot blank the column.
