# Task 0006: Browser smoke tests, process rules and UI fixes

**Branch:** `agent/implementer/browser-tests`
**ADRs:** 0001, 0002, 0004

## Goal

Make "the screen works" an automated check. Task 0005 shipped a blank page
in dev mode that tests, typecheck, build and the reviewer all missed; only a
manual browser test caught it.

## Scope

### 1. Playwright smoke tests (Chromium only)

- **Dev mode:** start `npm run dev`, open the page, confirm it renders the
  "Movimientos" heading and no module request fails. This is the mode the
  task 0005 bug lived in.
- **Production mode:** `npm run build` + `npm start` with a temporary
  `PERSONAL_OS_DATA_DIR`, then the full flow on a clean database with the
  seed: add an expense, see it in the list and in the totals; edit it;
  delete it (accept the confirmation); type an invalid amount and see the
  error next to the field.
- `npm run test:e2e` runs both. Unit tests stay in `npm test`.
- **CI:** a separate `e2e` job that installs only Chromium and runs
  `npm run test:e2e`. Keep the existing `check` job unchanged.
- Locally, Playwright may need system packages that require `sudo`. You
  cannot run `sudo`: if they are missing, stop and give Manuel the exact
  command to run, then continue.

### 2. UI fixes (found by Manuel in PR #11)

- Text the user typed (concept, notes) is shown exactly as typed. No CSS or
  code may change its capitalization.
- The month label next to the month picker shows "Noviembre De 2026":
  remove it if it only repeats the picker, or fix it to "noviembre de 2026".

### 3. `CLAUDE.md` rules (one line each)

- Never write to GitHub through `gh api` (no edits, comments or state
  changes). If a `gh` command fails, stop and report it.
- After a PR is merged, never push to its branch again. New work starts on
  a new branch from `main`.
- `.claude/settings*.json` and `.claude/hooks/` are maintained by Manuel only.
  (The guard hook now enforces this.)

### 4. Process

Register every new package in `docs/dependencies.md`. Run the `reviewer`
subagent before opening the PR and add the review log row. Handoff in
`docs/handoffs/`.

## Out of scope

Fixed expenses, categories screen, backups, any data model change,
`.claude/` configuration (Manuel's).

## Done when

- Both CI jobs (`check` and `e2e`) pass on the PR.
- Reverting the task 0005 dev-proxy fix locally makes the dev-mode smoke
  test fail (prove it, then restore the fix).
- The reviewer verdict is in the PR, with blockers and majors fixed or
  explained.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
