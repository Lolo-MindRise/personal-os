# ADR-0007: Risk-based review and phone-first pull requests

**Status:** Accepted
**Date:** 2026-11-24
**Deciders:** Manuel Cardoso

## Context

The overnight run produced six pull requests in 52 minutes. Agent capacity
is no longer the bottleneck; Manuel's review time is. Every PR got the same
treatment regardless of risk, and manual test steps were sometimes ambiguous
(the autostart test did not say how to verify the result).

## Decision

1. **Risk level per PR** (`low`, `medium`, `high`), decided by the reviewer
   subagent, never by the implementer. Definitions live in
   `.claude/agents/reviewer.md`. Review effort follows the level: low, read
   the summary; medium, review guide plus manual test; high, read the
   flagged files, run the manual test, deploy with a fresh backup.
2. **Phone-first PR template:** risk, what changes for Manuel, a review
   guide (where to look, decisions to approve, what was not verified) and a
   manual test with how to verify each step.
3. **Reviewer integrity:** `.claude/agents/` joins `.claude/settings*.json`
   and `.claude/hooks/` as maintained by Manuel only, enforced by the guard.
4. Merging stays human for every level (ADR-0001). Auto-merging low-risk PRs
   is a later decision, once risk labels have proven reliable.

## Consequences

- Review time scales with risk instead of with PR size.
- The reviewer becomes part of the trust boundary, so it is protected.
- Revisit: after ~10 PRs, check that risk levels matched reality before
  considering auto-merge for `low`.
