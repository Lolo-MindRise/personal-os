# Task 0001-01: Search filters in the URL

**Branch:** `agent/0001/01-search-url`
**ADRs:** 0002 (stack); plan `docs/plans/0001-polish.md`
**Depends on:** none
**Touches:** `src/web/MovementSearch.tsx`, `src/web/MovementsPage.tsx`, the search state helpers it uses, their unit tests and `e2e/` movements-search tests.

## Goal

The movements search panel's own filters (text, dates, amounts, category,
kind) live only in component state. Keep them in the URL, like the link
filters (`?debt=`, `?fixed=`), so reload and the back button keep them. This
closes the open deviation from task 0015 ("panel filters not in the URL").

## Scope

1. Serialise the search panel filters to URL query params and read them back
   on load. Reuse the existing link-filter URL mechanism; do not invent a
   second one.
2. Reload keeps the filters and the panel state they imply (open, results).
3. The back button restores the previous filters (each applied search is a
   history entry; typing alone is not).
4. Invalid or unknown params are ignored, never crash the page.
5. Unit tests for the serialise/parse helpers (round trip, invalid values);
   an e2e test: apply filters, reload, filters kept; back, previous filters.

## Out of scope

CSV export (task 02), server API changes, new dependencies, `.claude/`.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR.
- Both reviewer verdicts are in the PR, with blockers and majors fixed or
  explained.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
