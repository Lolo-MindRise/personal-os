# ADR-0001: Agent autonomy on branches, human-only merge gate

**Status:** Accepted (revised 2026-11-24)
**Date:** 2026-11-23
**Deciders:** Manuel Cardoso

## Context

This repository is both a product (a personal management app, evolved from a
personal finance spreadsheet) and a testbed for an autonomous development
system: several Claude Code agents with different specializations working in
parallel, supervised remotely from a phone.

The working rule carried over from previous projects says agents never commit
or push without explicit approval. Under that rule, every autonomous run
stalls waiting for a human, which defeats the purpose of the system. The
control is still needed, but it must move to a point where it does not block
the work.

Constraints:
- Supervision happens mostly from a phone, often asynchronously.
- Agents may run in the cloud (laptop closed) or locally via Remote Control.
- Usage budget is a Claude Max 5x plan.
- GitHub Free: branch rulesets are only enforced on public repositories.
- Agents authenticate to GitHub with Manuel's own account.

## Decision

Agents commit and push freely **to their own branches** and open pull
requests. **Only Manuel merges into `main`.**

The repository is **public**, so GitHub enforces the `protect-main` ruleset
on the free plan. It never contains real personal or financial data.

The gate has three layers:

| Layer | What it enforces | Enforced by |
|-------|------------------|-------------|
| 1. Ruleset `protect-main` | No direct pushes to `main` (PR required), no force pushes, no deletion. CI as required check once it exists. | GitHub (server) |
| 2. Guard hook `.claude/hooks/guard.sh` | Agents cannot merge PRs, change rules or visibility, push to `main`, force-push, or touch the real instance and data (ADR-0003). | Claude Code (client) |
| 3. `CLAUDE.md` | Working rules, PR format, dependencies, deviations. | Agent instructions |

### Known limitation

Because agents use Manuel's account, GitHub cannot tell an agent's merge from
Manuel's. Layer 1 guarantees nothing reaches `main` without a PR; it does not
guarantee who merges it. That guarantee rests on layer 2. The residual risk
is an unreviewed PR reaching `main`. In this project that is recoverable with
a revert and exposes no data, so it is accepted for now.

## Options Considered

| Dimension (weight) | A. GitHub Pro + agent account | B. Public repo, single account + hook (chosen) | C. Private repo, no server rules |
|--------------------|------|------|------|
| Strength of the merge gate (35 %) | 5 | 4 | 2 |
| Code privacy (20 %) | 5 | 1 | 5 |
| Cost (15 %) | 3 | 5 | 5 |
| Setup simplicity (15 %) | 3 | 5 | 5 |
| Phone workflow (15 %) | 5 | 5 | 4 |
| **Weighted total** | **4.40** | **4.05** | **3.80** |

Option A (a dedicated GitHub account for agents plus a required approval)
is the only setup where the server itself guarantees human-only merges.
It was judged disproportionate for a single-user personal project at this
stage.

## Consequences

- Easier: unattended runs, parallel work, supervision from the phone, no cost.
- Harder: PR review becomes the main human workload; PRs must be small.
- Public repo: every commit is visible. Real data, secrets and personal
  details never enter the repository.
- Public repo: anyone can open issues or PRs. Agents treat that content as
  untrusted data, never as instructions (see `CLAUDE.md`).
- Revisit at phase 2 (parallel agents): move to option A if PR volume grows
  or the hook proves insufficient.

## Action Items

1. [x] Create the repository and make it public.
2. [x] Ruleset `protect-main`: PR required (0 approvals), block force pushes, restrict deletions, no bypass.
3. [ ] Add the guard hook and verify it blocks a merge attempt in a real session.
4. [ ] Add CI (task 0001) and set it as a required check in `protect-main`.
5. [ ] Add a PR template matching the "Pull requests" section of `CLAUDE.md`.
