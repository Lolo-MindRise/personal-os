# Handoff 2026-11-24: Repository protection

## Done
- Repository created, bootstrap docs pushed to `main`.
- Repository made public (GitHub Free only enforces rulesets on public repos).
- Ruleset `protect-main` active: PR required, no force push, no deletion, no bypass.
- ADR-0001 revised: single GitHub account, three-layer gate, known limitation.
- Guard hook added: `.claude/settings.json` + `.claude/hooks/guard.sh`.
- `CLAUDE.md`: guard hook and public repository rules.

## In progress
- Nothing.

## Blocked
- Nothing.

## Next steps
1. Verify the guard hook in a real Claude Code session (ask it to run
   `gh pr merge 1`; it must be blocked).
2. Run task 0001 (walking skeleton + CI).
3. Add CI as a required check in `protect-main`.

## Context
- Off-site backup decision still open (ADR-0003).
