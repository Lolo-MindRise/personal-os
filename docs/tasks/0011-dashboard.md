# Task 0011: Home dashboard

**Branch:** `agent/implementer/dashboard`
**ADRs:** 0001, 0002, 0004, 0005, 0006

## Goal

A home screen ("Inicio") where Manuel understands his financial situation
at a glance. His real goals this year: save for a move and pay off his
debts. It becomes the default screen of the app.

## Scope

### 1. Dependency

Add Recharts (ADR-0006) with its `docs/dependencies.md` entry. Check with
`npm install-scripts ls` that it brings no install scripts; if it does,
stop and report. Record the production bundle size before and after.

### 2. API

One endpoint, `GET /api/dashboard?month=YYYY-MM` (default: current month),
returning everything the screen needs, in cents:
- **Key figures:** accumulated savings; the goal with the nearest future
  target date (name, target, progress, amount still needed, monthly saving
  required); total estimated debt; projected savings of the month.
- **Last 12 months** ending at the selected month: income, expenses,
  repayments, savings and accumulated savings per month.
- **Expenses of the month by category** with the budget in effect for each.
- **Debts:** estimated balance and remaining installments per debt, and the
  total. Show a progress bar only if the stored data gives a real baseline;
  never invent one.
- **Upcoming:** the month's pending recurring entries and the next three
  milestones that are not done (overdue first).

Reuse the existing calculations (summary, budget, debts, accumulated
savings) instead of duplicating them.

### 3. Screen (UI text in Spanish)

- "Inicio" first in the navigation and the default route.
- Top row: the four key figures as cards.
- Chart 1: last 12 months, income and expenses as bars and accumulated
  savings as a line, with tooltips in Spanish amount format.
- Chart 2: expenses of the month by category against budget, over-budget
  categories clearly marked.
- Debts and goals as progress or balance cards; upcoming items as a list
  with links to their screens.
- Month selector, same behaviour as the other screens.
- **Empty states:** Manuel's real instance is still being filled in. Every
  block must look sensible with no data (no initial balance, no goals, no
  budget, no debts) and say what to set up, with a link to that screen.
- Readable on a desktop screen in light and dark system themes.
- Charts have a text alternative (accessible label or summary).

### 4. Tests

- API: each block with seed data and with an empty database; the 12-month
  window across a year boundary.
- E2E (production mode): the dashboard is the default page, renders the
  charts with seed data, and shows the empty states on a fresh database.

### 5. Process

Register every new package in `docs/dependencies.md`. Run the `reviewer`
subagent before opening the PR and add the review log row. Handoff in
`docs/handoffs/`. ADR-0006: tick action item 1.

## Out of scope

Data model changes, editing data from the dashboard, exports, new
calculations not listed above.

## Done when

- Both CI jobs pass on the PR.
- The reviewer verdict is in the PR, with blockers and majors fixed or
  explained.
- `npm run dev` with the seed shows the dashboard working, and with an empty
  database shows the empty states.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
