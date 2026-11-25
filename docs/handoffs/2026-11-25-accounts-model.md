# Handoff 2026-11-25: Accounts model (plan 0002, task 01)

Branch `agent/0002/01-accounts-model` (from `integration/0002-insights-and-accounts`).

## Done
- `accounts` table (name unique, type bank/cash/savings, opening balance cents, opening date).
- `movements.account_id` NOT NULL DEFAULT 1. Migration `0006_stormy_bastion.sql`: generated SQL
  was additive (CREATE TABLE, UNIQUE INDEX, ALTER TABLE ADD COLUMN); reviewed by hand, then
  extended with the "Principal" insert and three triggers.
- API: `GET/POST /api/accounts`, `PATCH /api/accounts/:id` (no delete). Movements accept and
  return `accountId`; unknown account is a 400. Confirming a fixed item accepts `accountId`.
- UI: account selector in the movement form (also when confirming a fixed item); "Cuenta"
  column in the movement list only when there is more than one account (placed after
  "Concepto" so existing column positions do not move).
- Seed adds the cash account "Efectivo" and puts the seeded "Cine" movement in it.
- Glossary: cuenta, the three types, Principal. `docs/data-model.md` updated.
- Tests: migration row-survival (3 movements keep every value, all in Principal), trigger
  behaviour, accounts API, movement and confirm with accounts, form and list.

## Decisions taken
- Principal: id 1, type `bank`, balance 0, dated on the earliest movement, else the fixed
  default 2026-01-01.
- No `REFERENCES` on `movements.account_id`: SQLite cannot add a NOT NULL foreign key column
  without a table rebuild. Triggers reject an unknown account on insert/update and block deleting
  an account that has movements.
- The "default account" is id 1 (`DEFAULT_ACCOUNT_ID`); imports and confirm-all use it.
- Opening balance may be negative (overdrawn account).
- The form sends `accountId` only when chosen; an absent value means Principal.

## Next step
- Orchestrator runs the reviewer. Task 03 (Cuentas screen) can build on `GET /api/accounts`.
