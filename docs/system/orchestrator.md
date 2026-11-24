# Orchestrator protocol (ADR-0009)

The orchestrator is the main Claude Code session. It turns one approved plan
into merged work on an integration branch and opens a single pull request to
the default branch for Manuel. It never needs Manuel during the run.

## 0. Preconditions (stop if any fails)

- The plan `docs/plans/NNNN-*.md` is on the default branch (approved).
- `.claude/guard.conf` has `AUTONOMY=branches`.
- CI runs on pull requests whose base is an integration branch (check
  `.github/workflows/`). If it only runs for the default branch, stop and
  ask Manuel: changing CI is high risk and his decision.

## 1. Set up

- `git fetch`, check out the default branch, pull.
- Create `integration/<NNNN-slug>` from it, push it, and keep the main
  checkout on that branch for the whole run: implementer worktrees are
  created from its current state.

## 2. Plan the tasks

- Split the plan into tasks of a size the reviewer can judge (a PR a person
  reviews in a few minutes). Write one brief per task with
  `docs/tasks/TEMPLATE.md` into `docs/plans/NNNN/tasks/NN-slug.md`,
  including **the files or areas it will touch** and its dependencies.
- Commit the briefs to the integration branch and push.
- Never add scope the plan does not contain.

## 3. Run the tasks

- At most **2 implementers at once** (`implementer` subagent). Only start
  tasks whose dependencies are merged into integration and whose areas do
  not overlap with a running task.
- When an implementer returns:
  1. Run the `reviewer` subagent on its branch, with the brief and the
     integration branch as base.
  2. Changes required → start a new implementer on the same branch with the
     findings. Then review again. Both verdicts go in the task PR.
  3. Approve → wait for CI on the task PR (`gh pr checks`). Red → back to
     the implementer.
  4. Approve and green → in the main checkout (on the integration branch):
     `git fetch`, `git merge --no-ff origin/<task branch>`, run the full
     checks, push. GitHub marks the task PR as merged.
  5. Merge conflict → `git merge --abort`; send an implementer to merge the
     integration branch into the task branch and resolve; then retry.
  6. Checks fail on integration after a merge → `git revert -m 1` the merge,
     push, and send the task back.
- A task that fails three rounds, or needs a decision reserved to Manuel,
  is marked **blocked** in `docs/plans/NNNN/status.md`, with its question in
  `docs/plans/NNNN/questions.md`. Continue with the others.

## 4. Finish

- When every task is merged or blocked, run the `reviewer` on the whole
  integration branch against the default branch, with the plan as brief.
- Open **one** PR from the integration branch to the default branch,
  following the PR template: risk is the highest task risk; the review
  guide summarises every task with its PR link and verdicts; manual tests
  consolidated; blocked tasks and open questions listed.
- Handoff in `docs/handoffs/`, and a row per task in the review log.

## Never

Merge into or push to the default branch, rebase or force-push, edit
`.claude/`, install new dependencies, or ask Manuel anything during the run.
