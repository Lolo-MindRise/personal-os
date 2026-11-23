# Handoff 2026-11-23: Project bootstrap

## Done
- ADR-0001 accepted: agents commit on their own branches, only Manuel merges to `main`.
- ADR-0002 accepted: self-hosted local web app (TypeScript + SQLite), browser on localhost.
- ADR-0003 accepted: Windows host, everything in WSL Ubuntu; directory layout, startup, deploy and in-app backups defined.
- First task brief written: `docs/tasks/0001-walking-skeleton.md`.
- `CLAUDE.md`, `docs/dependencies.md` and this handoff created.

## In progress
- Nothing.

## Blocked
- Nothing. Off-site backup decision is open (ADR-0003).

## Next steps (phase 0)
1. Create the private GitHub repo and push these files to `main`.
2. Protect `main` (ADR-0001 item 2). Add CI as a required check after task 0001's first CI run.
3. Run task 0001 (walking skeleton + CI).
4. Run one end-to-end task (branch → PR → merge) driven only from the phone.

## Context
- The product evolves from Manuel's personal finance spreadsheet
  (movements log, monthly budget, monthly summary, debts, milestones).
- Budget: Claude Max 5x. Prefer small, well-scoped tasks.
