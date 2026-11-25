# Task 0002-04: Tags

**Branch:** `agent/0002/04-tags`
**ADRs:** 0002; migration rules in CLAUDE.md; plan `docs/plans/0002-insights-and-accounts.md`
**Depends on:** 03 merged (migration slot and movement form). Owns the migration slot while it runs.
**Touches:** `src/server/db/schema.ts`, one new additive migration, a new `src/server/tagsApi.ts`, `src/server/movementSearchApi.ts`, movements API, `src/shared/`, `src/web/MovementForm.tsx`, `src/web/MovementSearch.tsx`, `src/web/movementSearch.ts` (URL helpers), `src/web/MovementsPage.tsx`, a tag management UI (list with rename and delete; place it under Ajustes next to Categorías, new page or section), `src/web/App.tsx` (entry only), `docs/ui-glossary.md`, tests.

## Goal

Free tags on movements, many per movement, filterable in the search with the
filter kept in the URL.

## Scope

1. `tags` and `movement_tags` tables (many to many), additive migration,
   hand-reviewed, existing rows survive (test). Tag names unique ignoring
   case and surrounding spaces.
2. Create tags on the fly in the movement form (type and press Enter or
   comma); show tags in the movement list.
3. Movements search filters by tag (one tag; if several are selected, a
   movement must have all of them: record this conservative choice). The tag
   filter is part of the URL like the other search filters (reload and back
   keep it; reuse `movementSearch.ts` serialise/parse; unknown tag ignored).
4. Tag management list: rename and delete. Deleting a tag removes only the
   links, **never movements** (test). Renaming to an existing name is refused.
5. CSV export (task 0001-02) gains no tag column unless trivial; if added,
   keep the existing columns' order and add it last, and update tests.
6. Glossary: add `etiqueta`/tag wording first; note the existing glossary
   says categories must not be called "etiqueta", so use `tag` / `tags` or
   `marca` consistently and record the choice in the glossary.

## Out of scope

Accounts, reports, changing how anything is calculated, new dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.
- e2e: tag a movement, filter by the tag, reload: the filter stays.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
