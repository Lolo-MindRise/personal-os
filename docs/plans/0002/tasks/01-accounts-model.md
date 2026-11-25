# Task 0002-01: Accounts, model and movement account selector

**Branch:** `agent/0002/01-accounts-model`
**ADRs:** 0002 (money in cents, dates ISO), migration rules in CLAUDE.md; plan `docs/plans/0002-insights-and-accounts.md`
**Depends on:** 00 merged
**Touches:** `src/server/db/schema.ts`, one new additive migration in `drizzle/`, `src/server/db/seed.ts`, a new `src/server/accountsApi.ts` (+ registration in `app.ts`/`api.ts`), `src/shared/schemas.ts`/`api.ts`, `src/web/MovementForm.tsx`, `src/web/MovementList.tsx`, `src/web/api.ts`, `docs/ui-glossary.md`, tests. Owns the migration slot while it runs.

## Goal

Introduce accounts so later tasks (transfers, balances, dashboard) can build
on them, without changing how any total is calculated.

## Scope

1. `accounts` table: name, type (`bank`, `cash`, `savings`), opening balance
   in integer cents, opening balance date (ISO). Names unique.
2. `movements` gets an `account_id` (and fixed items confirmed into
   movements carry the account of the movement they create).
3. **Additive migration only.** It creates the account "Principal" (type
   `bank`, opening balance 0, date of the earliest movement or a fixed
   default; record the choice) and assigns every existing movement to it.
   New movements default to "Principal". Review the generated SQL by hand:
   no DROP TABLE, no rebuild of an existing table (see CLAUDE.md). If the
   tool wants a rebuild to add the column, write the additive migration by
   hand. **Test that existing rows survive** with their values intact.
4. API: list/create/update accounts (no delete in this task); movements API
   accepts and returns `accountId`; validation with Zod; unknown account
   rejected.
5. UI: an account selector in the movement form and the account shown in the
   movement list when more than one account exists; confirming a fixed item
   lets the user pick the account (default Principal). Labels follow
   `docs/ui-glossary.md`; add `cuenta` and the three types first.
6. Seed/fixtures updated; all existing tests still pass unchanged in meaning.

## Out of scope

Transfers, balances, the Cuentas screen (task 03), tags, reports,
dashboard, any change to how income, expenses or savings are calculated.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.
- The migration test shows every pre-existing row kept and assigned to Principal.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
