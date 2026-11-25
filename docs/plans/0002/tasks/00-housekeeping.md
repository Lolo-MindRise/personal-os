# Task 0002-00: Housekeeping, lint ignores worktrees

**Branch:** `agent/0002/00-housekeeping`
**ADRs:** 0002; plan `docs/plans/0002-insights-and-accounts.md`
**Depends on:** none (runs alone, first)
**Touches:** `eslint.config.js`, `.prettierignore` only (plus a handoff).

## Goal

`eslint .` and `prettier --check .` also scan `.claude/worktrees/*` (full
copies of the repo) and `eslint .` runs out of memory when several exist.
Make plain `npm run lint` work in every worktree and on integration.

## Scope

1. Add `.claude/worktrees/` to the ignores of `eslint.config.js` and to
   `.prettierignore`. Nothing else in those files changes.
2. Verify: with at least two worktrees present under `.claude/worktrees/`,
   plain `npm run lint` passes without `NODE_OPTIONS` and without a
   command-line ignore.

## Out of scope

Anything under `.claude/` (never edit it), other lint rules, dependencies.

## Manual test

None.

## Done when

- Both CI jobs pass on the PR.
- Both reviewer verdicts are in the PR.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
