# ADR-0009: Orchestrator and integration branches

**Status:** Accepted
**Date:** 2026-11-25
**Deciders:** Manuel Cardoso
**Amends:** ADR-0001 (who may merge)

## Context

Agents already work well alone; Manuel's review is the bottleneck. He wants
agents to develop in separate branches without needing him, and to review
only what goes to the default branch. Claude Code subagents can run in
parallel, each isolated in its own git worktree (`isolation: worktree`).

## Decision

- Work is organised in **plans** (`docs/plans/`), approved by Manuel by
  merging them. The **orchestrator** (main session, `docs/system/orchestrator.md`)
  splits a plan into task briefs and runs `implementer` subagents in
  parallel (max 2), each in its own worktree and branch.
- Each task goes through the reviewer (twice when fixed) and CI, then the
  orchestrator merges it into `integration/<plan>`.
- **Agents may merge into integration branches. Only Manuel merges into the
  default branch.** One PR per plan, integration → default branch.
- Questions never stop the run: they block only their task and go to the
  plan's `questions.md`.

## Options Considered

| Dimension (weight) | A. One PR per task to main | B. Integration branch per plan | C. Agent teams (experimental) |
|---|---|---|---|
| Manuel's review effort (30 %) | 2 | 5 | 4 |
| Autonomy during the run (25 %) | 4 | 5 | 5 |
| Safety and traceability (20 %) | 5 | 4 | 3 |
| Tool stability (15 %) | 4 | 4 | 1 |
| Conflict handling (10 %) | 2 | 4 | 3 |
| **Weighted total** | **3.40** | **4.55** | **3.50** |

## Consequences

- Manuel reviews one larger PR per plan, with per-task PRs (already merged
  into integration) available for detail.
- Enforcement: the guard blocks commits, merges and reverts on the default
  branch and pushes to it, detecting the branch of each command's own
  working directory (worktrees).
- `npm ci` runs without a prompt (each worktree needs it; it installs only
  the committed lockfile). Installing or removing packages still asks.
- Worktrees are created from the main checkout's current branch
  (`worktree.baseRef: head`), so the orchestrator keeps it on the
  integration branch.
- Revisit after the first plan: task size, parallelism, review quality.
