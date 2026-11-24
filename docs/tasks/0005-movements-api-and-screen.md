# Task 0005: Movements API and screen

**Branch:** `agent/implementer/movements`
**ADRs:** 0001, 0002, 0004

## Goal

The first usable feature: record, list, edit and delete movements for a
month, and see that month's totals. Built on the data model from task 0004.

## Scope

### 1. Money helpers

One shared module, used by both API and UI, with thorough tests:
- Parse user input in Spanish format to integer cents: `12,50`, `12.5`,
  `1.234,56`, `1234`, with surrounding spaces. Reject empty, negative,
  more than two decimals, and anything non-numeric.
- Format cents for display in `es-ES`: `123456` → `1.234,56 €`.

### 2. API (Fastify)

- `GET /api/categories`, optionally filtered by `kind`.
- `GET /api/movements?month=YYYY-MM`, ordered by date, newest first.
- `POST /api/movements`, `PATCH /api/movements/:id`, `DELETE /api/movements/:id`.
- `GET /api/months/:month/summary`: total income, expenses and repayments,
  and the month's savings (income − expenses − repayments), all in cents.
- Validation with the Zod schemas from task 0004. Invalid input returns
  `400` with a readable message. A kind that does not match the category
  (composite foreign key) returns `400`, not `500`. Unknown id returns `404`.

### 3. Screen (React, UI text in Spanish)

- Month selector, defaulting to the current month.
- The month's totals at the top: ingresos, gastos, amortizaciones, ahorro.
- List of the month's movements: fecha, tipo, categoría, concepto, importe.
- Form to add a movement: date (default today), kind, category (filtered by
  the selected kind), concept, amount (Spanish format), notes. Clear error
  messages next to the field that failed.
- Edit and delete from the list. Delete asks for confirmation.
- Plain CSS, no UI library. Clean and readable on a desktop screen.

### 4. Tests

- Money helpers: every case listed above.
- API: each endpoint, valid and invalid input, including the kind/category
  mismatch and the `404` case. In-memory database.
- Screen: the form validates input and the list shows what the API returns.

### 5. `CLAUDE.md`

Add two rules, one line each:
- Agents never modify `.claude/settings.json` or any permission settings;
  permission changes are made by Manuel.
- Never edit a migration that has been committed to `main`; add a new one.

### 6. Process

Register every new package in `docs/dependencies.md`. Run the `reviewer`
subagent before opening the PR and add the review log row. Handoff in
`docs/handoffs/`.

## Out of scope

Budget, debts, goals and milestones screens; end-to-end browser tests
(Playwright); backups and deploy; any change to the data model.

## Done when

- All CI checks pass on the PR.
- `npm run dev` with the seed data shows the screen working.
- The reviewer verdict is in the PR, with blockers and majors fixed or explained.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
