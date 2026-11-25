# Task 0003-02: CSV export, account column

**Branch:** `agent/0003/02-csv-account-column`
**ADRs:** 0002; plan `docs/plans/0003-data-safety-and-daily-use.md`
**Depends on:** none. Can run in parallel with 01 (trash core) because it only touches the client CSV code.
**Touches:** `src/web/movementsCsv.ts`, its unit tests, `e2e/movements-export.spec.ts`, and `src/web/MovementsPage.tsx` only where the export is built. No server or schema change.

## Goal

The CSV export tells which account each movement belongs to.

## Scope

1. Add a "Cuenta" column with the account name. Keep every existing column
   and its order; the new column goes last (after "Marcas"), as agreed for
   additions.
2. The account name is a text cell and goes through the existing escaping
   (quotes, `;`, newlines and the leading apostrophe against formula
   injection); add tests with an account name that starts with `=` and one
   with a `;`.
3. Works for both the month export and the search export; fetch accounts
   from the existing accounts API (no new endpoint). An unknown account id
   falls back to an empty cell and does not crash.
4. Update the unit tests and the export e2e (header row and a row value).

## Out of scope

Server changes, other columns, new dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
