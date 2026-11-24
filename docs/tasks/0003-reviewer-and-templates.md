# Task 0003: Reviewer subagent and templates

**Branch:** `agent/implementer/reviewer-and-templates`
**ADRs:** 0001, 0004

## Goal

Put ADR-0004 in place: an independent, read-only reviewer that every task
calls before opening its PR, plus the templates that give every task and PR
the same shape.

## Scope

1. **`.claude/agents/reviewer.md`**, a subagent definition:
   - Model: the most capable alias (`opus`).
   - Tools: `Read`, `Grep`, `Glob`, `Bash` only. No `Edit` or `Write`.
     Bash is for read-only git (`git diff`, `git log`, `git show`).
   - Input: the task brief path. It reviews `git diff main...HEAD`.
   - Checks, in order: scope matches the brief (nothing missing, nothing
     extra); ADR compliance; `CLAUDE.md` rules (dependencies registered,
     no real data or secrets, languages); tests cover new logic;
     unnecessary complexity.
   - Output: a verdict (`approve` or `changes required`) and a list of
     findings, each with severity (`blocker`, `major`, `minor`),
     `file:line` and a one-line reason. Short. No praise, no restating the diff.
2. **`.github/pull_request_template.md`** with the sections required by
   `CLAUDE.md`, plus a **Reviewer** section (verdict and findings addressed).
3. **`docs/tasks/TEMPLATE.md`**, a brief template with the sections used in
   tasks 0001–0003: branch, ADRs, goal, scope, out of scope, done when,
   if something blocks you.
4. **`docs/metrics/review-log.md`**, a table with columns: task, PR,
   reviewer verdict, findings by severity, findings by Manuel after review,
   notes. Add rows for tasks 0001 and 0002 marked "before reviewer".
5. **`CLAUDE.md`**: in "Definition of done", before opening the PR the
   implementer runs the `reviewer` subagent, fixes blockers and majors (or
   explains why not in the PR) and appends a row to the review log.
   Keep the addition to a few lines.
6. ADR-0004: tick action item 1.
7. Handoff in `docs/handoffs/`.

## Out of scope

Application code, CI, `guard.sh`, settings, any other subagent.

## Done when

- All CI checks pass on the PR.
- This task itself follows the new workflow: the implementer runs the new
  reviewer on this branch before opening the PR, and the PR includes its
  verdict and a review log row for task 0003.

## If something blocks you

Stop and report it in the PR or handoff as "Deviation proposed".
