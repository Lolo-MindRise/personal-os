# Plan 0002 status

Integration branch: `integration/0002-insights-and-accounts`

| Task | Depends on | State | PR | Notes |
|------|-----------|-------|----|-------|
| 00 housekeeping | – | merged | #53 | approve (1 round); plain lint passes with 9 worktrees |
| 01 accounts-model | 00 | pending | – | owns the migration slot |
| 02 reports | 00 | pending | – | no migration |
| 03 transfers-cuentas | 01 | pending | – | owns the migration slot |
| 04 tags | 03 | pending | – | owns the migration slot |
| 05 dashboard-additions | 03 | pending | – | no migration; parallel with 04 |
| 06 data-export-import | 01, 03, 04 | pending | – | last |

Order: 00; then 01 and 02; then 03 (and 02 if still running); then 04 and 05; then 06.
Only one task with a migration at a time (drizzle journal conflicts).
