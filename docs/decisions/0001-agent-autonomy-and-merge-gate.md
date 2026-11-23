# ADR-0001: Agent autonomy on branches, human-only merge gate

**Status:** Accepted
**Date:** 2026-11-23
**Deciders:** Manuel Cardoso

## Context

This repository is both a product (a personal management app, evolved from a
personal finance spreadsheet) and a testbed for an autonomous development
system: several Claude Code agents with different specializations working in
parallel, supervised remotely from a phone.

The working rule carried over from previous projects (ADR 0002 there) says
agents never commit or push without explicit approval. Under that rule, every
autonomous run stalls waiting for a human, which defeats the purpose of the
system. The control it provides is still needed, but it must move to a point
where it does not block the work.

Constraints:
- Supervision happens mostly from a phone, often asynchronously.
- Agents may run in the cloud (laptop closed) or locally via Remote Control.
- Usage budget is a Claude Max 5x plan, so blocked or wasted runs have a real cost.

## Decision

Agents may commit and push freely **to their own branches** and open pull
requests. **Only Manuel merges into `main`.** The gate is enforced server-side
(GitHub branch protection) and by CI checks, not by agent goodwill.

Rules kept from the previous model, now enforced by review and CI:
- No new dependency without an entry in `docs/dependencies.md`.
- No blanket package installs.
- Deviations from an ADR are proposed, never implemented silently.

## Options Considered

### Option A: Keep "no commit/push without approval"
| Dimension | Assessment |
|-----------|------------|
| Control | Maximum, per action |
| Autonomy | None: every run blocks on a human |
| Phone workflow | Poor: constant approvals |
| Usage cost | High: idle and restarted sessions |

### Option B: Branch autonomy + human merge gate (chosen)
| Dimension | Assessment |
|-----------|------------|
| Control | High, at the merge point, enforced by GitHub |
| Autonomy | High within a branch |
| Phone workflow | Good: review and merge PRs from the GitHub app |
| Usage cost | Lower: agents finish tasks end to end |

### Option C: Full autonomy, agents merge after green CI
| Dimension | Assessment |
|-----------|------------|
| Control | Low: CI only catches what tests cover |
| Autonomy | Maximum |
| Risk | Unacceptable for a first multi-agent setup |

## Trade-off Analysis

B moves human judgment from every step to the one step where it matters:
what reaches `main`. The cost is that bad work can accumulate on branches,
which is cheap to discard. C would remove the last human check before any
tooling has earned that trust.

## Consequences

- Easier: unattended runs, parallel work, supervision from the phone.
- Harder: PR review becomes the main human workload; PRs must be small and
  well described or review becomes the bottleneck.
- Revisit: after phase 2 (parallel sessions), evaluate whether low-risk PRs
  (docs only, tests only) could auto-merge on green CI.

## Action Items

1. [ ] Create the GitHub repository (private).
2. [ ] Protect `main`: require a pull request, require status checks to pass,
       block force pushes and deletions, no bypass for agents.
3. [ ] Add CI (GitHub Actions): lint, typecheck, tests on every PR.
4. [ ] Add a PR template matching the "Pull requests" section of `CLAUDE.md`.
5. [ ] Phase 1: add a PreToolUse hook that blocks `git push` to `main`,
       `git merge` into `main` and `--force` as a second line of defense.
