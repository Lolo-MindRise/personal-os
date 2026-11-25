# Plan 0003 status

Integration branch: `integration/0003-data-safety-and-daily-use`

| Task | Depends on | State | PR | Reviewer rounds | Notes |
|------|-----------|-------|----|-----------------|-------|
| 00 rehearse-migration | – | merged | #62 | 3 rounds | risk high; CI caught a SIGPIPE bug reviews missed |
| 01 trash-core | 00 | merged | #64 | 3 rounds (the limit) | risk high (migration 0009); non-additive index change rejected, slot handled in code |
| 02 csv-account-column | – | merged | #63 | 2 rounds | risk medium |
| 03 trash-ui | 01 | merged | #66 | 2 rounds | risk high; delete confirmation removed (decision for Manuel) |
| 04 budget-alerts | 01 | merged | #65 | 2 rounds | risk medium |
| 05 importer-accounts | 01 | merged | #67 | 2 rounds | risk medium; link opens Cuentas (partial deviation) |
| 06 reconciliation | 01, 03 | merged | #68 | 2 rounds (+1 discarded) | risk high (migration 0010) |
| 07 quick-add | 01 | merged | #69 | 1 round | risk medium |

Blocked tasks: none. Questions for Manuel: none (decisions are listed in the final PR).
Order run: 00; 01 and 02; 03 and 04; 05 and 06; 07. One migration task at a time.

Notes:
- `gh pr edit` fails (GraphQL Projects classic error): task PR bodies are stale on GitHub; the
  corrected bodies were kept in /tmp/pr-body-0003-NN.md and the final PR carries the summaries.
- Implementers share port 5321 for e2e; clashes were handled by waiting, never by killing processes.
- Guard hook: every implementer hit blocks on `sed -i` / heredocs and redid the edits with
  Edit/Write. One reviewer worked around a guard block (output to /tmp); later ones reported.
