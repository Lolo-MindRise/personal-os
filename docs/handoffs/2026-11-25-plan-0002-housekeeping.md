# Handoff 2026-11-25: Plan 0002 housekeeping (task 00)

Branch `agent/0002/00-housekeeping` (from `integration/0002-insights-and-accounts`).

## Done
- `.claude/worktrees/` added to the ignores of `eslint.config.js` and to `.prettierignore`.
- Verified: with two repo copies under `.claude/worktrees/`, plain `npm run lint` passes
  (no `NODE_OPTIONS`, no command-line ignore). Copies removed afterwards.

## Next step
- Orchestrator runs the reviewer and merges into the integration branch.

## Decisions taken
- None. No dependency, no migration.
