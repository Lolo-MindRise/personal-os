# Task 0003-06: Account reconciliation

**Branch:** `agent/0003/06-reconciliation`
**ADRs:** 0002 (money in cents); migration rules in CLAUDE.md; plan `docs/plans/0003-data-safety-and-daily-use.md`
**Depends on:** 01 merged (balances exclude deleted rows) and 03 merged (Cuentas screen files). Owns the migration slot (next after the trash one).
**Touches:** `src/server/db/schema.ts`, one additive migration, `src/server/accountsApi.ts` (or a new `reconciliationsApi.ts`), `src/shared/accountBalance.ts` (add a balance-at-date function that reuses the same rule), `src/web/AccountsPage.tsx`, a new reconcile panel, `src/web/api.ts`, data export/import files (`dataTables.ts`, `shared/dataFile.ts`, tests, so the new table is in the full export; the table-list test will fail if it is forgotten), `docs/ui-glossary.md`, tests.

## Goal

Let Manuel compare an account's balance in the app with the bank's real
balance at a date, see the difference, and keep a record, without the app
ever changing his data by itself.

## Scope

1. `reconciliations` table (additive migration, hand-reviewed, row-survival
   test): account, date (ISO), bank balance in cents (signed integer),
   the app's balance at that date and the difference stored at that moment,
   created at. Real foreign key to accounts is fine for a new table.
2. In Cuentas, "Conciliar" for an account: enter the bank's real balance
   and a date (default today). The app shows **its own balance at that date**
   (the account balance function evaluated as of that date: opening balance
   + movements and transfers dated after the opening date and on or before
   the date; deleted rows excluded; same rule as the balance, do not change
   it), the **difference** (bank minus app, signed, with a clear wording) and
   the **movements and transfers since the last reconciliation** of that
   account (up to the date; all of them if none).
3. Saving stores the reconciliation. The account line in Cuentas shows the
   last reconciliation (date and difference). A date before the account's
   opening date is refused with a clear message.
4. **No automatic adjustment movements**, ever: say in the UI that
   differences are fixed by the user by editing or adding movements.
5. The full data export/import includes the new table (round trip identical;
   old files without it still import).
6. Tests: pure function (balance at date: boundaries on the opening date and
   the reconcile date, transfers in and out, deleted rows excluded), API
   tests, and an e2e: reconcile with a bank balance 10 € different: the
   difference shows 10 € (acceptance), and the account shows its last
   reconciliation.

## Out of scope

Automatic adjustments, editing or deleting reconciliations, bank connections,
new dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
