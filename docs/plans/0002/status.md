# Plan 0002 status

Integration branch: `integration/0002-insights-and-accounts`

| Task | Depends on | State | PR | Reviewer rounds | Notes |
|------|-----------|-------|----|-----------------|-------|
| 00 housekeeping | – | merged | #53 | approve | plain lint passes with 9 worktrees |
| 01 accounts-model | 00 | merged | #54 | approve | risk high (migration 0006); PR body wrong on GitHub |
| 02 reports | 00 | merged | #55 | 3 rounds | whole-period links are an orchestrator change from the brief |
| 03 transfers-cuentas | 01 | merged | #56 | 3 rounds (the limit) | risk high (migration 0007; 0006 edited, it never reached main) |
| 04 tags | 03 | merged | #58 | approve | risk high (migration 0008) |
| 05 dashboard-additions | 03 | merged | #57 | approve | risk medium |
| 06 data-export-import | 01, 03, 04 | merged | #59 | approve after one fix round | risk high (bulk importer) |

Blocked tasks: none. Questions for Manuel: none (decisions are listed in the final PR).
Order run: 00; 01 and 02; 03; 04 and 05; 06. One migration task at a time.

Notes:
- `gh pr edit` fails (GraphQL Projects classic error): the bodies of #54 (wrong task's text) and
  other task PRs are stale or wrong on GitHub; the plan PR carries the correct summaries.
- Implementers shared port 5321 for e2e; clashes were handled by waiting, never by killing processes.
