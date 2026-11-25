# Plan 0003 status

Integration branch: `integration/0003-data-safety-and-daily-use`

| Task | Depends on | State | PR | Notes |
|------|-----------|-------|----|-------|
| 00 rehearse-migration | – | merged | #62 | 3 rounds; risk high (touches restore.sh helpers, reads real backups); CI caught a SIGPIPE bug (`list_backups \| head -n 1` under pipefail) that passed locally; follow-ups: `pid_is_app` and restore.sh read-only check on the original backup |
| 01 trash-core | 00 | merged | #64 | 3 rounds (the limit); risk high (migration 0009, soft delete over the whole read path). Round 1 dropped a non-additive index change (orchestrator decision, kept the full unique index; slot handled in code). Round 2: confirm-all skips trash-held items, import preview excludes them (`heldByTrash` on pending entries). Minors left: equivalence test strips `heldByTrash` at any depth, no singular form in the skipped message, no web test for it |
| 02 csv-account-column | – | merged | #63 | 2 rounds; risk medium; minors left: e2e alert locator not specific to the export error, download count asserted right after the alert |
| 03 trash-ui | 01 | merged | #66 | 2 rounds; risk high (UI path that deletes permanently; delete confirmation removed, decision for Manuel); minors left: undo timer tests rewrite the effect logic by hand (no DOM test env), focus return untested, `cleanUp` in trash.spec soft-deletes the whole month and checks no status, leftover dialog handler in recurring.spec |
| 04 budget-alerts | 01 | merged | #65 | 2 rounds; risk medium; fixed: e2e cleanup left a trashed movement in the shared e2e DB, Presupuesto meter now expense rows only; minors left: cleanup error can hide the original failure, no repayment-row test |
| 05 importer-accounts | 01 | merged | #67 | 2 rounds; risk medium; major fixed: a category pick counted as a manual check, so a flagged row could stay checked after switching account; partial deviation: the flag's link opens Cuentas, not the specific account; global duplicate detection kept; minors left: no retry if the accounts request fails, a duplicate row no longer turns checked after a category pick (unrecorded before), `reclassify` loses manual choices (pre-existing) |
| 06 reconciliation | 01, 03 | merged | #68 | 2 rounds (first review attempt was incomplete and redone); risk high (migration 0010, additive); ON DELETE CASCADE kept (deleting an account also deletes its reconciliations; the confirmation says so); period rule (last reconciliation strictly before D, D]; minors left: Save not disabled while the preview loads, stale error shown after a date change, no component test for the in-flight date change |
| 07 quick-add | 01 | running | – | last task |

Order: 00; then 01 and 02; then 03 and 04; then 05 and 06; then 07 (or earlier when a slot is free and files do not overlap).
Only one task with a migration at a time (drizzle journal conflicts).
