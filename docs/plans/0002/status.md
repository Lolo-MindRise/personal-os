# Plan 0002 status

Integration branch: `integration/0002-insights-and-accounts`

| Task | Depends on | State | PR | Notes |
|------|-----------|-------|----|-------|
| 00 housekeeping | – | merged | #53 | approve (1 round); plain lint passes with 9 worktrees |
| 01 accounts-model | 00 | merged | #54 | approve (1 round); risk high (migration); PR body wrong on GitHub, `gh pr edit` fails |
| 02 reports | 00 | merged | #55 | approve after 3 rounds (the limit); whole-period links on averages/changes are an orchestrator change from the brief |
| 03 transfers-cuentas | 01 | merged | #56 | approve after 3 rounds (the limit); risk high (migration 0007, edit of 0006 which never reached main: dev DBs created from integration before the edit must be recreated) |
| 04 tags | 03 | merged | #58 | approve (1 round); risk high (migration 0008); minors left: tag key without NFC normalisation, no test for rollback or for formulas in tags in CSV |
| 05 dashboard-additions | 03 | merged | #57 | approve (1 round); risk medium; minors left: block does not say it counts from today, overdue pending fixed items not in the 30-day block |
| 06 data-export-import | 01, 03, 04 | running | – | last |

Order: 00; then 01 and 02; then 03 (and 02 if still running); then 04 and 05; then 06.
Only one task with a migration at a time (drizzle journal conflicts).
