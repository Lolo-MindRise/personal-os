# Handoff 2026-11-24: Reviewer and templates (task 0003)

## Done
- Branch `agent/implementer/reviewer-and-templates`.
- `.claude/agents/reviewer.md`: `opus`, tools `Read, Grep, Glob, Bash`
  (read-only git by instruction). Reviews `git diff main...HEAD` against
  the brief, ADRs and `CLAUDE.md` in the order the brief sets. Output:
  verdict + `[severity] file:line — reason`.
- `.github/pull_request_template.md`: `CLAUDE.md` sections + Reviewer.
- `docs/tasks/TEMPLATE.md`: brief template (optional Context, as in 0002).
- `docs/metrics/review-log.md`: rows for 0001, 0002 ("before reviewer"),
  0003.
- `CLAUDE.md` "Definition of done": reviewer step, 3 lines.
- ADR-0004 action item 1 ticked.
- Reviewer run on this branch; verdict in the PR and review log.

## Notes
- `guard.sh` greps the whole Bash command for the real-data paths, so a
  heredoc that only *mentions* them is blocked. Hit it while writing the
  reviewer; reworded the reviewer to point to `CLAUDE.md` instead of
  spelling out the paths (no workaround). Worth knowing for future docs.
- The Bash tool can't be limited to read-only git in subagent frontmatter;
  the restriction is by instruction only. The guard hook still applies.
- Local `npm run lint` warns on `.claude/settings.local.json` (git-ignored
  globally, not in CI). Pre-existing, unrelated.
- The PR template also covers ADR-0001 action item 5; not ticked, as it is
  outside this brief.

## In progress
- Nothing.

## Blocked
- Nothing.

## Next steps
1. Manuel: review and merge the PR; tick ADR-0001 item 5 if agreed.
2. Fill "Findings by Manuel" in the review log for 0003 after review.
3. Revisit the QA subagent question after 3–4 reviewed tasks (ADR-0004).

## Decisions taken
- Verdict rule: `changes required` if any blocker or major.
- Reviewer does not run builds/tests; it relies on the implementer's report.
