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
| `movements` | `date`, `kind`, `category_id`, `concept`, `amount_cents`, `notes?`, `debt_id?`, `recurring_item_id?` | amount > 0; kind must equal the category's kind (composite FK `(category_id, kind)`); `debt_id` only when kind is `repayment`; at most one movement per `(recurring_item_id, month of date)`; deleting the item sets `recurring_item_id` to null |
| `recurring_items` | `kind`, `category_id`, `concept`, `amount_cents`, `expected_day`, `start_month`, `end_month?`, `notes?` | amount > 0; kind must equal the category's kind (composite FK); day 1–31; `end_month` not before `start_month` |
| `recurring_skips` | `recurring_item_id`, `month` | unique `(recurring_item_id, month)`; deleted with the item |
| `budget_lines` | `category_id`, `amount_cents`, `valid_from` (month) | amount > 0; unique `(category_id, valid_from)` |
| `debts` | `name`, `monthly_payment_cents`, `balance_cents`, `balance_as_of`, `remaining_installments`, `annual_rate_bps`, `notes?` | payment > 0; balance, installments, rate >= 0 |
| `goals` | `name`, `target_amount_cents`, `target_date` | amount > 0 |
| `milestones` | `title`, `target_date`, `status` (`pending`/`in_progress`/`done`), `notes?` | status defaults to `pending` |
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

## Not yet modelled

Expense sharing between two people (later, with its own migration).
