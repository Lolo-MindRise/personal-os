# Task 0003-05: CSV importer and accounts

**Branch:** `agent/0003/05-importer-accounts`
**ADRs:** 0002; plan `docs/plans/0003-data-safety-and-daily-use.md`
**Depends on:** 01 merged (it changes the importer's duplicate check in `importApi.ts`). Can run in parallel with 06.
**Touches:** `src/web/ImportPage.tsx`, `src/web/importState.ts`, `src/server/importApi.ts`, `src/shared/csvImport.ts` / `importClassify.ts` (only if needed), `src/shared/accountBalance.ts` (reuse the opening-date rule, do not change it), `docs/ui-glossary.md`, tests. No schema or migration.

## Goal

Importing a bank CSV must say which account the rows go to and warn about
rows the account's balance will silently not count.

## Scope

1. The importer asks for the **target account** (default Principal; list
   from the accounts API). Confirming the import creates the movements in
   that account.
2. Rows dated **on or before** the target account's opening date are
   flagged "fuera del saldo de la cuenta" in the preview and **unchecked by
   default** (the user can check them; say what that means). Use the same
   rule as the balance function (movements count strictly after the opening
   date): reuse one shared predicate, do not duplicate the rule.
3. The flag includes a link to edit the account's opening date (opens
   Cuentas on that account).
4. Changing the target account re-evaluates the flags and keeps the user's
   manual check/uncheck choices where they still apply.
5. The server enforces nothing new about the date (the importer may import
   flagged rows if the user chooses), but validates the account exists
   (unknown account: 400 with a field error) and defaults to Principal when
   omitted. The duplicate check keeps ignoring trashed rows (task 01).
6. Tests: pure tests of the flag predicate and the state reducer (boundary:
   the opening date itself is flagged, the next day is not); API test
   (account used, unknown account refused, default); e2e: import into a
   second account with a row older than its opening date: the row is flagged
   and unchecked (acceptance).

## Out of scope

Changing balances rules, automatic edits to opening dates, new dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
