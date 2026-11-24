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
| `movements` | `date`, `kind`, `category_id`, `concept`, `amount_cents`, `notes?`, `debt_id?` | amount > 0; kind must equal the category's kind (composite FK `(category_id, kind)`); `debt_id` only when kind is `repayment` |
| `budget_lines` | `category_id`, `amount_cents`, `valid_from` (month) | amount > 0; unique `(category_id, valid_from)` |
| `debts` | `name`, `monthly_payment_cents`, `balance_cents`, `balance_as_of`, `remaining_installments`, `annual_rate_bps`, `notes?` | payment > 0; balance, installments, rate >= 0 |
| `goals` | `name`, `target_amount_cents`, `target_date` | amount > 0 |
| `milestones` | `title`, `target_date`, `status` (`pending`/`in_progress`/`done`), `notes?` | status defaults to `pending` |

## Budget lookup

The budget for a category in a month is the line with the latest `valid_from`
not after that month (`budgetForMonth`). Changing a budget means adding a line
with a new `valid_from`; history is never edited. There is no line before the
first `valid_from`, so the lookup returns nothing.

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
