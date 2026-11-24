# Task 0004: Data model, database layer and housekeeping

**Branch:** `agent/implementer/data-model`
**ADRs:** 0001, 0002, 0003, 0004

## Goal

The database the app will be built on, derived from Manuel's personal
finance spreadsheet: schema, migrations, validation and fictional seed data.
No API endpoints and no UI yet.

## Scope

### 1. Data model

Write `docs/data-model.md` (short: one table per entity, fields, rules) and
implement it with Drizzle on SQLite.

| Entity | Purpose | Key fields |
|--------|---------|-----------|
| `categories` | What a movement is about | name (unique), kind: `income`, `expense` or `repayment` |
| `movements` | Every income, expense or extra repayment | date, kind, category, concept, amount, notes, optional debt |
| `budget_lines` | Monthly budget per category | category, amount, `valid_from` month |
| `debts` | Loans being paid off | name, monthly payment, balance and its as-of date, remaining installments, annual rate, notes |
| `goals` | Savings targets | name, target amount, target date |
| `milestones` | Plan checkpoints | title, target date, status: `pending`, `in_progress`, `done`, notes |

Rules:
- Money: integer cents, always positive; the kind gives the direction.
  Never floating point (ADR-0002).
- Dates: `YYYY-MM-DD`. Months: `YYYY-MM`. Interest rate: integer basis
  points (12.5 % = 1250).
- A movement's kind must match its category's kind.
- `debt_id` is only allowed on `repayment` movements.
- Budget for a category in a given month: the line with the latest
  `valid_from` that is not after that month. Changing a budget means adding
  a line, never editing history.
- Every table has `id`, `created_at`, `updated_at`.

### 2. Database layer

- In production, the database file lives in `PERSONAL_OS_DATA_DIR`
  (ADR-0003). If the variable is missing in production, refuse to start
  with a clear error.
- In development: a gitignored file inside the repo. In tests: in-memory.
- Migrations run on startup and are committed to the repo.

### 3. Validation

Zod schemas for creating each entity, enforcing the rules above, shared so
the future API and frontend use the same ones.

### 4. Seed data (fictional only)

A seed script for development with a plausible but **invented** month:
categories (generic names, no bank or company names), a few movements, a
budget, one personal loan, one goal, two milestones. The repo is public:
nothing in the seed may come from Manuel's real figures.

### 5. Tests

Migrations apply to an empty database; every rule above is enforced
(valid and invalid cases); the budget lookup returns the right line across a
change of `valid_from`; the seed runs cleanly.

### 6. Housekeeping

- ADR-0001: tick action item 5 (PR template, done in task 0003).
- Add `.claude/settings.local.json` to `.prettierignore`.
- Add `Bash(git fetch *)` to `permissions.allow` in `.claude/settings.json`.

### 7. Process

Register every new package in `docs/dependencies.md`. Run the `reviewer`
subagent before opening the PR and add the review log row (`CLAUDE.md`).
Handoff in `docs/handoffs/`.

## Out of scope

API endpoints, UI, backups, deploy scripts, expense sharing between two
people (added later with its own migration).

## Done when

- All CI checks pass on the PR.
- The reviewer verdict is in the PR, with blockers and majors fixed or
  explained.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
