# Data model

SQLite via Drizzle (ADR-0002). Schema: `src/server/db/schema.ts`. Migrations:
`drizzle/` (generated with `npm run db:generate`, applied on startup).
Creation schemas (Zod, shared with the future API and frontend):
`src/shared/schemas.ts`.

## Conventions

- Money: integer cents, always positive. The kind gives the direction.
- Dates `YYYY-MM-DD`, months `YYYY-MM`, interest rates in integer basis points
  (12.5 % = 1250). Timestamps: ISO 8601 UTC text.
- Every table: `id` (autoincrement), `created_at`, `updated_at`.
- Layers: Zod validates real calendar dates and types; the database enforces
  the rest with `CHECK` (including integer type on cents and basis points) and foreign keys (its date check is a format check only).

## Tables

| Table | Fields | Rules |
|-------|--------|-------|
| `categories` | `name`, `kind` (`income`/`expense`/`repayment`) | `name` unique, not blank |
| `accounts` | `name`, `type` (`bank`/`cash`/`savings`), `opening_balance_cents`, `opening_balance_date` | `name` unique, not blank; balance may be negative; the migration creates "Principal" (id 1, `bank`, balance 0, dated the day before the earliest movement, or 2025-12-31, so its balance counts every existing movement); `DELETE /api/accounts/:id` refuses Principal and any account with movements (trigger) or transfers (foreign key) |
| `transfers` | `date`, `amount_cents`, `from_account_id`, `to_account_id`, `notes?`, `deleted_at?` (trash, plan 0003) | plan 0002 task 03, migration `0007`; money between two accounts, never income, expense or savings; amount > 0; the accounts must differ (CHECK); both are real foreign keys (no action), so an account with transfers cannot be deleted. Account balance = opening balance + movements on it dated after the opening date (income +, expense and repayment −) ± transfers dated after it; a transfer dated on or before either account's opening date is refused (`src/shared/accountBalance.ts`) |
| `reconciliations` | `account_id`, `date`, `bank_balance_cents` (signed), `app_balance_cents`, `difference_cents`, `created_at` | plan 0003 task 06, migration `0010` (additive: new table and index only); the app's balance at `date` and the difference (bank minus app, CHECKed) are frozen when saved; real foreign key to `accounts` with `ON DELETE CASCADE` (an account can only be deleted when it has no movements or transfers, so only these records go with it); `date` may not be before the account's opening date; the app never creates adjustment movements; `GET /api/accounts/:id/reconciliation-preview?date=`, `POST /api/accounts/:id/reconciliations`, `GET /api/reconciliations`; balance at a date is `accountBalanceAt` (`src/shared/accountBalance.ts`), same rule as the balance; old data files without the table import with it empty |
| `tags` | `name`, `name_key` | plan 0002 task 04, migration `0008` ("marcas" in the UI); `name_key` is the trimmed, lower-cased name and is unique, so names are unique ignoring case and surrounding spaces; created on the fly when a movement is saved with them; renaming to an existing name is refused |
| `movement_tags` | `movement_id`, `tag_id` | many to many, primary key on both columns; both are real foreign keys with `ON DELETE CASCADE`: deleting a tag removes only its links, deleting a movement removes only its links. The search filters by tag ids, and a movement must carry all selected tags (conservative choice); unknown ids are ignored |
| `movements` | `date`, `kind`, `category_id`, `concept`, `amount_cents`, `notes?`, `debt_id?`, `account_id`, `recurring_item_id?` | `account_id` not null, default 1; no FK clause (SQLite cannot add one without a table rebuild), triggers reject an unknown account; amount > 0; kind must equal the category's kind (composite FK `(category_id, kind)`); `debt_id` only when kind is `repayment`; at most one movement, trashed ones included, per `(recurring_item_id, month of date)` (unique index, see Trash); `deleted_at?` = in the trash (plan 0003, migration `0009`); deleting the item sets `recurring_item_id` to null |
| `recurring_items` | `kind`, `category_id`, `concept`, `amount_cents`, `expected_day`, `start_month`, `end_month?`, `notes?`, `debt_id?` | `debt_id` (task 0013) only when kind is `repayment`; confirming a linked item reduces the debt's estimated balance by the principal part (French amortization, computed on read, never stored); amount > 0; kind must equal the category's kind (composite FK); day 1–31; `end_month` not before `start_month` |
| `recurring_skips` | `recurring_item_id`, `month` | unique `(recurring_item_id, month)`; deleted with the item |
| `budget_lines` | `category_id`, `amount_cents`, `valid_from` (month) | amount > 0; unique `(category_id, valid_from)` |
| `debts` | `name`, `monthly_payment_cents`, `balance_cents`, `balance_as_of`, `remaining_installments`, `annual_rate_bps`, `notes?` | payment > 0; balance, installments, rate >= 0 |
| `goals` | `name`, `target_amount_cents`, `target_date` | amount > 0 |
| `milestones` | `title`, `target_date`, `status` (`pending`/`in_progress`/`done`), `notes?` | status defaults to `pending` |
| `category_rules` | `pattern`, `category_id` | task 0013: "concept contains pattern → category" for the CSV import; pattern not blank; applied in id order; deleted with its category |
| `import_settings` | `id` (always 1), `mapping` (JSON) | task 0013: the last CSV column mapping, one row |
| `app_settings` | `id` (always 1), `initial_savings_cents`, `initial_savings_date` | one row, absent until first saved; balance >= 0; the balance is valid at the end of its date, so movements dated after it add to it |

## Budget lookup

The budget for a category in a month is the line with the latest `valid_from`
not after that month (`budgetForMonth`). Changing a budget means adding a line
with a new `valid_from`; history is never edited. There is no line before the
first `valid_from`, so the lookup returns nothing.

## Recurring items (ADR-0005)

Fixed income and expenses are defined once. A month's **pending entries are
computed on read, never stored**: the items due that month (from `start_month`
to `end_month`, both included) with neither a confirmed movement nor a skip in
that month (`dueEntries`, `src/server/db/recurring.ts`).

- **Expected date:** `expected_day` clamped to the month's length (31 in
  February becomes 28, or 29 in a leap year): `expectedDate`, `src/shared/recurring.ts`.
- **Confirm:** creates a normal movement with `recurring_item_id` set, from the
  expected values; amount, date, concept and notes may be overridden, but the
  date must stay in the month being confirmed. The unique index
  `movements_recurring_item_month_unique` (on `recurring_item_id` and
  `substr(date, 1, 7)`, hand-written in migration `0002`) makes a second
  confirmation in the same month impossible; the API answers `409` first.
- **Skip:** a row in `recurring_skips`; undoing it deletes the row. A skipped
  entry cannot be confirmed until the skip is undone.
- **Changing an item** only affects future confirmations. Confirmed movements
  are real records and never change with the item; deleting an item keeps them
  (link set to null) and removes its skips.
- **Deleting a confirmed movement** makes its item pending again (nothing to
  recompute: pending is derived).
- A movement linked to an item keeps its month: its date can change inside the
  month, not move to another one. Its kind and category stay editable on
  purpose: a confirmed movement is a real record and the user may correct it
  (the item itself does not change, and the link stays).
- Past months keep showing unconfirmed items as pending.

### Month summary

Totals (`income`, `expense`, `repayment`, `savings`) count confirmed movements
only. Pending amounts are reported apart, and
`projectedSavings = savings + pendingIncome − pendingExpense − pendingRepayment`
(a fixed loan installment is real money out, so pending repayments are
subtracted too).

## Database location

- Production: `$PERSONAL_OS_DATA_DIR/personal-os.sqlite`; the server refuses to
  start if the variable is missing (ADR-0003).
- Development: `.dev-data/personal-os.sqlite` in the repo (gitignored). The
  data directory variable is ignored outside production.
- Tests: `:memory:`.
- `npm run db:seed` fills the development database with an invented month.
  It refuses to run in production.

## Trash (plan 0003, task 01)

`movements` and `transfers` have a nullable `deleted_at` (ISO 8601 UTC timestamp; migration
`0009`). `DELETE /api/movements/:id` and `DELETE /api/transfers/:id` set it; the row stays and is
invisible to every reader. Every query that reads the two tables for the app's figures uses
`liveMovements()` / `liveTransfers()` from `src/server/db/live.ts`; `trashGuard.test.ts` fails when
a server file imports a table without them and `trashEquivalence.test.ts` fails when an endpoint
forgets the exclusion. Endpoints: `GET /api/trash`, `POST /api/trash/{movements,transfers}/:id/restore`,
`DELETE /api/trash/{movements,transfers}/:id` (only rows already in the trash). Nothing is deleted
automatically. The unique index `movements_recurring_item_month_unique` is unchanged (full, not
partial): a trashed confirmation still holds the (fixed item, month) slot. The item shows as
pending again (pending logic is live-only), but confirming it (single, confirm-all, CSV import
commit) is refused with 409 / 400 "Hay un movimiento de este fijo en la papelera: restáuralo o
elimínalo definitivamente." and nothing is written. So restoring is never blocked by the slot;
it is refused (409, "No se puede restaurar: ...") only when the fixed item is skipped that month,
or the category, account or debt is gone or mismatched. Deleting a
category or an account keeps counting trashed rows as "in use". The full JSON export keeps trashed
rows with `deletedAt`; the importer accepts files without that key (`null`).

## Full-data export and import (plan 0002, task 06)

`GET /api/data/export` returns one JSON file (`src/shared/dataFile.ts`): `app`, `formatVersion`
(1), `exportedAt`, `tables` (every table by SQL name, rows keyed by the Drizzle property names, in
primary key order) and `sequences` (the AUTOINCREMENT counters, so ids deleted before the export
are never reused). `POST /api/data/import` validates the whole file (shape, unique keys,
references including the trigger-enforced `movements.account_id`, `tags.name_key`), refuses any
database that already has data (only the default Principal account is ignored; it is replaced by
the file's), and writes everything in one transaction in `TABLE_INSERT_ORDER`. Body limit 25 MiB.
A test fails when a schema table or column is missing from the file definition. When you add a
table: add it to `ROW_SCHEMAS`, `TABLE_INSERT_ORDER` and `referenceProblems`.

## Not yet modelled

Expense sharing between two people (later, with its own migration).
