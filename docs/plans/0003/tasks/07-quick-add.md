# Task 0003-07: Quick add (key N) and category suggestion

**Branch:** `agent/0003/07-quick-add`
**ADRs:** 0002; plan `docs/plans/0003-data-safety-and-daily-use.md`
**Depends on:** 01 merged (suggestions must ignore deleted movements). Can run in parallel with 05 or 06 only if the touched files do not overlap.
**Touches:** `src/web/App.tsx` (global key handler and panel mount), `src/web/SidePanel.tsx` / `MovementForm.tsx` (only the suggestion area and what is needed to open the form from anywhere), `src/web/MovementsPage.tsx` (only to refresh after a save made elsewhere), a new server endpoint (e.g. in `movementSearchApi.ts` or a new `suggestApi.ts`) and pure helper in `src/shared/`, `src/web/api.ts`, `docs/ui-glossary.md`, tests. No schema or migration.

## Goal

Recording a movement becomes one keystroke away, and the app proposes the
category it would guess, without ever deciding for Manuel.

## Scope

1. Key `N` opens the new-movement side panel **from any screen**. It does
   nothing while the user is typing in an input, textarea, select or
   contenteditable, when a modifier key (Ctrl, Alt, Meta) is held, when
   another panel or dialog is open, or on key repeat. The panel returns
   focus to where the user was when it closes. Saving works from every screen
   and refreshes the list if the user is on Movimientos. A discoverable hint
   ("N: nuevo movimiento") exists somewhere sensible (button title or help
   line), not noisy.
2. When a concept is typed (debounced), suggest the category **most often
   used with similar concepts in past movements** of the same kind (income
   or expense): similarity is decided by a pure, tested function on
   normalised text (lowercase, accents stripped, punctuation and digits
   ignored; exact normalised match first, then shared word tokens of three or
   more letters); the most frequent category wins; ties are broken by the most
   recent use; with no similar movement there is no suggestion. Deleted
   movements are ignored. Bounded work (limit rows scanned; local single-user
   app).
3. The suggestion is **visible and never applied without Manuel choosing it**
   (e.g. "Sugerencia: Supermercado" with a "Usar" button; the category field
   does not change by itself, also not on blur or save). Accessible (announced
   politely, keyboard usable). Changing the kind clears or recomputes it.
4. Tests: key handler cases (typing in a field, modifiers, repeat, panel
   open, opens on Informes: acceptance), the similarity function (accents,
   case, ties, no match, kind filter, deleted ignored), the endpoint, and an
   e2e: press N on Informes, the panel opens; type a concept used before, the
   suggestion appears and the category is unchanged until "Usar" is pressed.

## Out of scope

Auto-categorisation rules (they exist in the importer, do not change them),
machine learning, new dependencies, a global command palette.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
