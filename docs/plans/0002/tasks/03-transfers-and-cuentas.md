# Task 0002-03: Transfers, balances and the Cuentas screen

**Branch:** `agent/0002/03-transfers-cuentas`
**ADRs:** 0002; migration rules in CLAUDE.md; plan `docs/plans/0002-insights-and-accounts.md`
**Depends on:** 01 merged. Owns the migration slot while it runs.
**Touches:** `src/server/db/schema.ts`, one new additive migration, `src/server/accountsApi.ts` (extend), a new `src/server/transfersApi.ts`, `src/shared/` (balance helpers, schemas), a new `src/web/AccountsPage.tsx`, `src/web/App.tsx` (Ajustes entry and route only), `src/web/api.ts`, `docs/ui-glossary.md`, tests.

## Goal

Move money between accounts without touching income, expenses, savings,
budget, projection or dashboard totals, and show balances per account.

## Scope

1. `transfers` table (separate entity, never a movement of kind income or
   expense): date, amount in cents (> 0), from account, to account (must
   differ), optional note. Additive migration; hand-reviewed; test that
   existing rows survive.
2. API: create, list, update and delete transfers.
3. Account balance = opening balance + movements on that account dated
   after the opening balance date (income and repayments counted with the
   sign the app already uses for money in/out of an account) ± transfers.
   Pure, tested function in `src/shared/`.
4. "Cuentas" screen under Ajustes: list with balances, create/edit account,
   register a transfer, list transfers (edit/delete). Labels follow the
   glossary; add `transferencia`, `saldo de la cuenta`, `saldo inicial de la
   cuenta` (distinct from the existing "saldo inicial" of savings).
5. **Invariant tests:** a transfer of 100 € from Principal to another
   account changes both balances by exactly ±10000 cents and leaves the
   monthly summary, budget, projection and dashboard savings/totals
   unchanged (assert against the existing endpoints before and after).
6. Deleting an account that has movements or transfers is refused.

## Out of scope

Dashboard account balances (task 05), tags, reports, changing any existing
calculation.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
