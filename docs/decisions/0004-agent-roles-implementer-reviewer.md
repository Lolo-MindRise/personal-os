# ADR-0004: Agent roles — implementer + independent reviewer

**Status:** Accepted
**Date:** 2026-11-24
**Deciders:** Manuel Cardoso

## Context

Phase 1 adds specialization. Subagents start with a clean context, can use
their own model and can have restricted tools. Each extra role re-reads what
it needs, so every role added costs usage on a Claude Max 5x plan, and every
extra hand-off makes failures harder to trace.

## Decision

Two roles per task:

1. **Implementer** (the main session): reads the brief, writes code and
   tests, writes the handoff, opens the PR. Runs on a mid-tier model by
   default; the model is chosen when the session is launched.
2. **Reviewer** (subagent `reviewer`, most capable model, read-only): called
   by the implementer before opening the PR. Reviews the branch diff against
   the task brief, the ADRs and `CLAUDE.md`, and returns a verdict with
   findings. It never edits files.

The implementer fixes every blocker and major finding, or explains in the PR
why not. The reviewer's verdict is summarized in the PR.

## Options Considered

| Dimension (weight) | A. Implementer + reviewer | B. Full chain (coordinator, implementer, QA, reviewer, docs) | C. A + independent QA |
|---|---|---|---|
| Error detection (30 %) | 3 | 5 | 4 |
| Usage cost (25 %) | 5 | 2 | 4 |
| Simplicity, debuggability (20 %) | 5 | 2 | 4 |
| Review independence (15 %) | 4 | 5 | 5 |
| Phone supervision (10 %) | 4 | 3 | 4 |
| **Weighted total** | **4.15** | **3.45** | **4.15** |

B was discarded for usage cost and traceability. A and C tie; what separates
them is whether the implementer's own tests are enough, and there is no
evidence yet that they are not.

## Consequences

- Every task gets an independent check before Manuel sees it.
- **Measurement:** for each task, `docs/metrics/review-log.md` records what
  the reviewer found and what Manuel found in the PR afterwards.
- **Revisit after 3–4 tasks:** if bugs slip through that independent tests
  would have caught, add a QA subagent (option C).

## Action Items

1. [ ] Task 0003: reviewer subagent, PR template, task brief template,
       review log, `CLAUDE.md` workflow update.
