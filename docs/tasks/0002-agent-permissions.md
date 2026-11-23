# Task 0002: Project permissions and guard hook hardening

**Branch:** `agent/implementer/agent-permissions`
**ADRs:** 0001, 0003

## Context

Manuel's global Claude Code settings in WSL are now empty on purpose: each
project declares its own rules in its repository. This project follows
ADR-0001 (agents commit and push on their own branches; only Manuel merges),
so agents must be able to work without a prompt for routine steps, while
dependency installs and anything dangerous still stop or are blocked.

## Scope

Edit `.claude/settings.json` only (plus the doc updates listed below):

1. `permissions.defaultMode`: `acceptEdits`.
2. `permissions.allow`: routine git and GitHub steps (`git status`, `git diff`,
   `git log`, `git add`, `git commit`, `git push`, `git switch`,
   `git checkout -b`, `gh pr create`, `gh pr view`, `gh pr checks`) and the
   project's npm scripts (`npm run lint`, `npm run typecheck`, `npm run test`,
   `npm run build`, `npm test`).
3. `permissions.ask`: every dependency install or removal
   (`npm install`, `npm i`, `npm ci`, `npm uninstall`, `npm update`).
4. `permissions.deny`: reading `.env` and `.env.*` (except `.env.example`),
   `git reset --hard`, `git filter-branch`, `git filter-repo`.
5. Guard hook entry: add `"timeout": 10` and `"onFailure": "block"`, so a
   crashing hook blocks instead of letting the call through.
6. ADR-0001: mark action item 3 (guard hook verified) as done.
7. Handoff in `docs/handoffs/`.

The guard hook keeps blocking merges, pushes to `main`, force pushes and the
real data paths. Do not duplicate those checks as permission rules.

## Out of scope

Changes to `guard.sh`, CI, application code, any other ADR.

## Done when

- JSON is valid (`node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8'))"`).
- All CI checks pass on the PR.
- The PR description lists every rule added and why, following `CLAUDE.md`.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
