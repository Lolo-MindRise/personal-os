# Task 0002-02: Informes (reports screen)

**Branch:** `agent/0002/02-reports`
**ADRs:** 0002; plan `docs/plans/0002-insights-and-accounts.md`
**Depends on:** 00 merged. Independent of accounts.
**Touches:** a new `src/web/ReportsPage.tsx` (and chart helpers), a new `src/server/reportsApi.ts` + registration, `src/shared/` report types and pure aggregation helpers, `src/web/App.tsx` (sidebar entry and route only), `docs/ui-glossary.md`, tests. No schema or migration.

## Goal

Show where the money goes over time, with every element linking to the
filtered movements.

## Scope

1. "Informes" screen under Seguimiento. Period selector: last 3, 6 or 12
   months (ending at the selected/current month).
2. Expenses by category per month: stacked bars.
3. One category's trend over the period: line (category chosen by the user).
4. Monthly average per category over the period.
5. The five categories whose spending changed most versus the previous
   period of the same length (amount and direction, neutral wording; show
   fewer if there is not enough data).
6. Every bar, point, row or list item links to the movements screen filtered
   by category and month (use the existing URL filters).
7. Uses the existing chart library and design system; integer cents; same
   expense definition as the existing summaries (do not change how expenses
   are calculated; reuse the existing helpers so Informes matches the
   movements screen totals per category).
8. Tests: pure aggregation helpers (period boundaries, year wrap, empty
   months, previous-period comparison); API test; e2e that the 12-month
   totals for two months equal the per-category totals the movements screen
   shows for those months.

## Out of scope

Accounts, tags, new dependencies, changing existing summaries.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
