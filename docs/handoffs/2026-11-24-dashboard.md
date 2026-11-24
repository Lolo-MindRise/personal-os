# Handoff 2026-11-24: Home dashboard "Inicio" (task 0011)

Branch `agent/implementer/dashboard` (from `main`).

## Done
- Dependency: `recharts` 3.11.1 (ADR-0006, entry in `docs/dependencies.md`). No install scripts
  (`npm install-scripts ls` clean), `npm audit --omit=dev` still 0. Bundle `dist/web` JS: 368.875 B
  (106,8 kB gzip) -> 835.824 B (235,4 kB gzip). ADR-0006 action item ticked.
- API `GET /api/dashboard?month=YYYY-MM` (default: current month; `today=` for tests only):
  `src/server/dashboardApi.ts` + pure helpers in `src/shared/dashboard.ts`. It reuses the existing
  code: `monthSummary` (extracted from `api.ts` into `monthSummary.ts`), `buildYearSummary`,
  `accumulatedAt`, `goalDtos`, `budgetMonth`, `listDebts`, `dueEntries`, `listMilestones`
  (the last three were exported/extracted, behaviour unchanged).
- Screen "Inicio" (first in the nav, default): 4 key-figure cards, 12-month chart (income and
  expenses as bars, accumulated savings as a line), expenses by category against budget, debt and
  goal cards, pending fixed items and next 3 milestones, month selector, empty states with links.
  Charts sit in a `figure` with a text summary, an `aria-label` and a "Ver los datos" table.
- Dark theme: `styles.css` now has a `prefers-color-scheme: dark` palette (it had none). The
  `#fef3f2` literals became `--danger-bg`.
- Tests: 686 unit/API (dashboard API with seed and empty DB, window across a year boundary,
  over-budget, debt baseline, milestones); e2e `dashboard.spec.ts` (seed, fixed clock 2026-01) and
  `dashboard-empty.spec.ts` (new server on port 5324 with an unseeded database, `E2E_EMPTY=1`).
  Existing specs that assumed Movimientos as the landing page now click it first.

## Decisions taken
- Accumulated savings card = at the end of the selected month (same value as the chart's last
  point). Next goal and its progress use today (as the Objetivos screen does).
- Next goal = nearest target date that is today or later (reached ones count; none -> empty state).
- Debt progress, no invented baseline: percent of the **recorded balance** repaid by linked extra
  repayments since its date (`repaidSince / balance`). The original loan amount is not stored, so
  the bar is hidden when the recorded balance is 0 and the text says what the percent measures.
  Regular installments are not deducted (same as the Deudas screen).
- Category chart lists expense categories with spending or a budget in the month; over budget =
  budget exists and actual > budget, marked with "(excedido)" on the axis, red bar and a flag in
  the data table (not colour only).
- No URL routing in the app: "links" are link-styled buttons that switch the screen.
- Charts are not lazy-loaded; the extra 128 kB gzip is fine for a local app.

## Verification
- Screenshots in light and dark (1280 px) checked by eye; found and fixed two defects (budget bars
  sharing one colour, card notes in the figure font).
- Not run: `npm run dev` by hand with an empty dev database. The dev smoke test passes on the
  dev server; the empty and seeded states are covered in production mode.

## Open / next
- Manuel to look at the real instance after deploying (empty states with real, partial data).
- A real instance was running on port 5320 during this work; nothing of it was touched.

## Blocked
Nothing. No Windows-only parts.
