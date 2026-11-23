# Handoff 2026-11-24: Agent permissions (task 0002)

## Done
- Branch `agent/implementer/agent-permissions`, PR opened against `main`.
- `.claude/settings.json`:
  - `defaultMode: acceptEdits`.
  - `allow`: routine git (`status`, `diff`, `log`, `add`, `commit`, `push`,
    `switch`, `checkout -b`), `gh pr create|view|checks`, npm scripts
    (`lint`, `typecheck`, `test`, `build`, `npm test`).
  - `ask`: every npm install/removal, including aliases (`i`, `add`, `ci`,
    `uninstall`, `un`, `remove`, `rm`, `update`, `up`, `upgrade`).
  - `deny`: `Read(**/.env)`, `Read(**/.env.*)`, `git reset --hard`,
    `git filter-branch`, `git filter-repo`.
  - Guard hook: `timeout: 10`, `onFailure: "block"`.
- ADR-0001 action item 3 ticked (verified in the walking-skeleton session).
- Verified with headless `claude -p` runs on fake, untracked env files
  (deleted afterwards): `.env` and `.env.local` denied via Read and via
  `cat`. `onFailure: "block"` confirmed in the Claude Code 2.1.331 hook
  schema; it applies to PreToolUse (ignored only on Stop-type events).

## Deviation proposed
- The brief asks to deny `.env.*` **except** `.env.example`. Deny always
  wins over allow, and the matcher has no negation: `.env.!(example)` was
  tested and let `.env.local` through. So `.env.example` is denied too.
  No `.env.example` exists today. Alternatives when one is needed:
  1. Name it `env.example` (no leading dot): not matched, simplest.
  2. Replace `.env.*` with ~14 character-class rules that spell out
     "anything but `example`" (complete but hard to review).
  3. Read it with `git show HEAD:.env.example` (works around a rule; not
     recommended).
  Recommendation: option 1.

## In progress
- Nothing.

## Blocked
- Nothing.

## Next steps
1. Manuel: review and merge the PR; decide on the `.env.example` deviation.
2. Manuel: CI job `check` as a required check (ADR-0001 action item 4).
3. PR template (ADR-0001 action item 5).

## Decisions taken
- Used the `:*` prefix form for Bash rules so bare commands (`git status`)
  match as well as commands with arguments.
- Added npm aliases to `ask` because the brief says "every" install or
  removal; without them `npm add x` would fall to the default prompt anyway,
  but listing them makes the intent explicit.
- `git push` is allowed broadly; pushes to `main` and force pushes remain
  blocked by `guard.sh`, not duplicated as rules (per the brief).
