# Task 0003-03: Trash, undo and Papelera screen

**Branch:** `agent/0003/03-trash-ui`
**ADRs:** 0002; plan `docs/plans/0003-data-safety-and-daily-use.md`
**Depends on:** 01 merged (soft delete, trash endpoints).
**Touches:** `src/web/MovementsPage.tsx`, `src/web/MovementList.tsx`, `src/web/AccountsPage.tsx` (transfer deletion only), a new `src/web/TrashPage.tsx` and a small undo/toast component, `src/web/App.tsx` and `src/web/router.ts` (Ajustes entry and route only), `src/web/api.ts`, `docs/ui-glossary.md`, tests. No schema or migration.

## Goal

Make the soft delete usable: an undo right after deleting, and a trash
where deleted movements and transfers can be restored or removed for good.

## Scope

1. Deleting a movement or a transfer shows "Deshacer" for **10 seconds**
   (visible, keyboard reachable, announced to screen readers, not only a
   colour). Undo restores it and the list/balances refresh. The deletion
   itself happens immediately (soft delete); undo calls the restore endpoint.
2. "Papelera" under Ajustes (next to Categorías, Marcas, Copias): lists
   deleted movements and transfers with their deletion date; "Restaurar";
   "Eliminar definitivamente" one by one **with a confirmation** that says it
   cannot be undone. Nothing is deleted automatically; no "empty trash"
   button.
3. Restore errors from the server (slot occupied, category gone, ...) are
   shown clearly in Spanish next to the row; the row stays.
4. Empty state and loading/error states in Spanish; labels per the glossary
   (use the terms added by task 01).
5. Tests: component/unit tests for the undo timing (fake timers) and the
   Papelera actions; e2e: delete a movement, undo within 10 s (it is back);
   delete again, wait for the toast to go, it is in Papelera, totals on
   Movimientos/Inicio are unchanged by its presence, restore works, and
   permanent delete asks for confirmation.

## Out of scope

Server behaviour (task 01), automatic purging, bulk actions, new dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR; reviewer verdicts in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
