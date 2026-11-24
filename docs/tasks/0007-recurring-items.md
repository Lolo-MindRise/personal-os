# Task 0007: Recurring items (fixed income and expenses)

**Branch:** `agent/implementer/recurring-items`
**ADRs:** 0001, 0002, 0004, 0005

## Goal

Implement ADR-0005: Manuel defines his fixed items once; each month they
appear as pending, and he confirms or skips them.

## Scope

### 1. Data model (new migration; never edit existing ones)

- `recurring_items`: kind, category (same kind/category rule as movements),
  concept, expected amount (cents, positive), expected day (1–31),
  start month, optional end month (not before start), notes, timestamps.
- `movements.recurring_item_id`: optional link to the item it confirms.
  The database must reject a second confirmed movement for the same item in
  the same month.
- `recurring_skips`: item and month, unique together.
- Deleting a recurring item keeps its confirmed movements (link set to null).
- Update `docs/data-model.md`.

### 2. API

- CRUD for recurring items.
- `GET /api/months/:month/pending`: items due that month (between start and
  end month) with no confirmed movement and no skip, each with its expected
  date (day clamped to the month's length) and amount.
- Confirm one: creates the linked movement; amount, date, concept and notes
  may be overridden. Confirming twice returns `409`.
- Confirm all: confirms every pending entry with expected values.
- Skip and undo skip, for one item and one month.
- Month summary adds pending income, pending expenses and projected savings
  (confirmed savings plus pending income minus pending expenses).
- Errors as in task 0005: `400` with readable Spanish messages, `404` for
  unknown ids.

### 3. Screens (UI text in Spanish)

- **Navigation** between "Movimientos" and a new "Fijos" screen.
- **Fijos:** list of recurring items; add, edit and end (set end month).
  Same form conventions as movements (Spanish amounts, errors per field).
- **Movimientos:** a "Pendientes" section above the list: each pending entry
  with expected date, category, concept and amount, and the actions
  "Confirmar" (opens the movement form pre-filled), "Saltar" and, for
  skipped entries, "Deshacer". A "Confirmar todos" button. Below the totals,
  the pending amounts and "Ahorro previsto".

### 4. Seed (fictional only)

Add a few fictional recurring items (one income, several expenses).

### 5. Tests

- Unit and API: due-month logic, day clamping (31 in February, leap years),
  start and end months, confirm, double confirm (`409`), confirm all, skip
  and undo, deleting a confirmed movement makes the item pending again,
  summary figures.
- End-to-end (production mode): create a recurring item, see it pending,
  confirm it with a changed amount, see totals and pending update; skip one;
  confirm all.

### 6. Housekeeping

- `CLAUDE.md`, one line: create and edit files with the file tools
  (Write, Edit), not with shell redirection or heredocs. (The guard hook
  inspects shell command text and blocks harmless heredocs that mention
  protected paths.)
- `docs/tasks/0005-movements-api-and-screen.md` was committed as executable:
  set its mode to 644.

### 7. Process

Register any new package in `docs/dependencies.md` (none expected). Run the
`reviewer` subagent before opening the PR and add the review log row.
Handoff in `docs/handoffs/`. ADR-0005: tick action item 1.

## Out of scope

Links between recurring items and the budget or debts; budget, debts, goals
and categories screens; backups.

## Done when

- Both CI jobs (`check`, `e2e`) pass on the PR.
- The reviewer verdict is in the PR, with blockers and majors fixed or
  explained.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
