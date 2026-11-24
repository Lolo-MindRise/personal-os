# Task 0008: Overnight autonomous run

**Branches:** `agent/overnight/01-categories` … `agent/overnight/06-milestones`
**ADRs:** all (0001–0005)

## Goal

Test how far the development system can go unattended. Manuel is asleep and
will review in the morning. Six blocks, in order. Fewer blocks done well is
better than six half-done.

## Run protocol (read this first, follow it for every block)

1. **Start:** `git fetch`, `git checkout main`, `git pull`. Confirm that task
   0007 is merged into `main`. If it is not, stop and say so.
2. **One block at a time.** Block 1 branches from `main`. Every later block
   branches from the previous block's branch (stacked PRs).
3. **For each block:** implement → unit and API tests → one Playwright e2e
   smoke test for any new screen (production mode) → `npm run lint`,
   `typecheck`, `test`, `test:e2e`, `build` → run the `reviewer` subagent →
   fix blockers and majors → push → open the PR with
   `gh pr create --base <previous block's branch, or main for block 1>`,
   title prefixed `[overnight N/6]` → wait for CI with `gh pr checks` until
   both jobs finish.
4. **Handoff:** keep one file, `docs/handoffs/2026-11-25-overnight-run.md`.
   Append a short section after each block: done, decisions taken, open
   questions, PR link. Because branches are stacked, it accumulates.
5. **Never ask Manuel anything during the run.** If something is ambiguous,
   take the most reasonable decision consistent with the ADRs and record it
   under "Decisions taken" in the PR and the handoff.

## Hard rules for the whole run

- **No new dependencies.** Do not install packages. If a feature seems to
  need one, build it without it or leave that part out and record it.
- **Data model changes are additive only:** a new migration per block when
  needed, never editing an existing one, never dropping or renaming columns.
- Never touch `.claude/`, never use `gh api` to write, never push to `main`,
  never force-push (all enforced; if the guard blocks you, do not work around it).
- No real data, no real paths in code: data and backup locations come only
  from environment variables (ADR-0003). Tests use temporary directories.
- Create and edit files with the file tools, not shell heredocs.
- UI text in Spanish; amounts in Spanish format via the existing money helpers.
- **Stop conditions:** if a block cannot get both CI jobs green after three
  fix attempts, mark it "Blocked" in the handoff and stop the run (later
  blocks depend on it). Also stop if the guard hook blocks something you
  believe the block genuinely needs.
- **When the run ends** (all six done, a stop condition, or you are about to
  run out of usage), finish the handoff with: what is done, the PRs in merge
  order, what is blocked and why, and what Manuel should test first.

## Blocks

### 1. Categories screen

Manuel's real instance starts empty: without categories he cannot record
anything. A "Categorías" screen: list by kind, add, rename. A category with
movements, recurring items or budget lines cannot be deleted (explain why
in the UI); one without them can. Unique names stay enforced.

### 2. In-app backups (ADR-0003)

- Use SQLite's online backup API (available in the existing driver).
- Back up on startup, every 24 h while running, and **before running
  migrations** (closing the gap recorded in task 0004).
- Backups go to `<PERSONAL_OS_DATA_DIR>/backups`, keeping the 14 most recent.
- If `PERSONAL_OS_BACKUP_MIRROR_DIR` is set, also copy there, keeping 7.
  If it is set but unreachable, keep running and expose the problem.
- `GET /api/backups/status`: last backup time, counts, mirror state and any
  warning. The UI shows a visible warning banner when there is a problem.
- Tests use temporary directories only.

### 3. Budget screen

For a selected month, one row per category: the budget in effect (latest
line whose `valid_from` is not after the month), the actual confirmed
amount, and the difference. Change a category's budget from a chosen month
onwards (adds a line; history is never edited). Totals row.

### 4. Debts screen

List debts; add and edit them. For each debt: balance and its as-of date,
monthly payment, remaining installments, rate, the extra repayments linked
to it (movements of kind `repayment` with that debt), and an estimated
current balance = balance at as-of date minus linked extra repayments after
that date. Updating the balance records a new as-of date. The movement form
lets a `repayment` movement be linked to a debt. Regular installments are
not deducted automatically (out of scope; say so in the UI).

### 5. Summary and goals

- App settings: initial savings balance and its date (additive migration).
- "Resumen" screen: one row per month of a selected year with income,
  expenses, repayments, savings and accumulated savings (initial balance
  plus monthly savings from its date). Simple CSS bars, no chart library.
- Goals: add and edit; for each, progress against accumulated savings,
  amount still needed and the monthly saving required to reach it by its date.

### 6. Milestones screen

List, add, edit; status `pending`, `in_progress`, `done`; ordered by target
date; overdue ones that are not done are highlighted.

## Out of scope

Deploy scripts, the Windows shortcut, anything touching the real instance,
expense sharing between two people, links between recurring items and
budget or debts.

## Done when

Each finished block has its PR open with both CI jobs green and the reviewer
verdict in it, and the handoff tells Manuel exactly where the run ended.
