# Plan 0001 status

Integration branch: `integration/0001-polish`

| Task | Depends on | State | PR | Reviewer rounds | Notes |
|------|-----------|-------|----|-----------------|-------|
| 01 search-url | – | merged | #47 | changes required, approve | branch `agent/ui/01-search-url` |
| 02 csv-export | 01 | merged | #49 | changes required, approve | branch `agent/0001/02-csv-export` |
| 03 backups-details | – | merged | #46 | approve | branch `agent/ui/03-backups-details` |
| 04 month-over-month | – | merged | #48 | changes required, changes required, approve | branch `agent/0001/04-month-over-month`; PR body stale |

Order run: 01 and 03, then 04, then 02 (after 01 merged).
Blocked tasks: none. Questions for Manuel: none (see decisions in the final PR).

Environment notes:
- `eslint .` and `prettier --check .` pick up `.claude/worktrees/*` and `eslint .` runs out of
  memory with many worktrees. Integration checks excluded them on the command line.
  CI is not affected (fresh checkout).
- Implementers named their branch `agent/ui/...` for tasks 01 and 03 instead of the brief's
  `agent/0001/...` (both fit CLAUDE.md `agent/<role>/<task>`).
