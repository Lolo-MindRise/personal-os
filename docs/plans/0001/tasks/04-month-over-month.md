# Task 0001-04: Month-over-month on Inicio

**Branch:** `agent/0001/04-month-over-month`
**ADRs:** 0002 (money as integer cents); plan `docs/plans/0001-polish.md`
**Depends on:** none
**Touches:** `src/web/DashboardPage.tsx`, `src/shared/dashboard.ts`, `src/server/dashboardApi.ts` (additive fields), tests.

## Goal

Each key figure on Inicio shows its change against the previous month, with
neutral wording.

## Scope

1. For every key figure on the dashboard, show the change versus the previous
   month: amount and direction, e.g. "+120,00 € respecto a octubre" (month
   name in Spanish). Neutral wording: no "good/bad" colouring or judgement.
2. Compute with integer cents; the logic is a pure, tested function in
   `src/shared/`. API changes are additive only.
3. Edge cases: no previous-month data (show nothing or "sin datos de
   septiembre", pick one and test it), zero change, January vs December of
   the previous year.
4. Labels follow `docs/ui-glossary.md`.
5. Unit tests for the function; e2e/component test of the rendered text with
   fixture data. The page keeps sending its own `today` (see task 0011).

## Out of scope

Data model or migration changes, new figures, charts, new dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR.
- Both reviewer verdicts are in the PR, with blockers and majors fixed or
  explained.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
