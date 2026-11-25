# Handoff 2026-11-25: Plan 0003 Data safety and daily use (orchestrated run)

Integration branch `integration/0003-data-safety-and-daily-use`, one PR to `main` for Manuel. Risk: high.

## Done
All eight tasks merged, each with reviewer verdicts and green CI on its task PR; full checks
(lint, typecheck, test, test:e2e, build) green on integration after every merge.
- 00 `scripts/rehearse-migration.sh` + README "Rehearse a deployment" (#62). 3 rounds.
- 01 Trash core: soft delete, exclusion everywhere, migration 0009 (#64). 3 rounds.
- 02 CSV export: account column (#63).
- 03 Undo (10 s) and Papelera screen (#66).
- 04 Budget alerts on Inicio and Presupuesto (#65).
- 05 Importer asks for the target account, flags rows outside the account balance (#67).
- 06 Account reconciliation, migration 0010 (#68).
- 07 Quick add (key N) and category suggestion (#69).

## Decisions taken by the orchestrator
- Trash migration is purely additive (two `deleted_at` columns). The original draft dropped and
  recreated a unique index: rejected (plan: additive only). A trashed confirmation keeps its
  fixed item's month slot, so re-confirming is refused until it is restored or deleted for good;
  "Confirmar todos" skips such items and reports them; the import preview leaves them out.
- The full JSON export keeps trashed rows with `deletedAt` (lossless move); CSV export excludes them.
- Deleting a movement or transfer no longer asks for confirmation (Deshacer + Papelera replace it).
- Reconciliation: ON DELETE CASCADE kept; period is (last reconciliation strictly before D, D].
- Importer: duplicate detection stays global; the flag link opens Cuentas, not the account.
- Presupuesto meter only on expense rows; alert "over" = 100 % or more.

## Blocked
None.

## Problems found
- Reviews approved scripts/rehearse-migration.sh while it had a timing-dependent SIGPIPE bug
  (`| head -n 1` under pipefail); only CI caught it. Same pattern may exist in `pid_is_app`.
- `gh pr edit` fails (Projects classic GraphQL error): task PR bodies are stale on GitHub.
- A first reviewer stopped without reading code (empty shell result); redone. One reviewer
  worked around a guard block; the rest reported blocks.

## Next step
Manuel: review and merge the plan PR; run `scripts/rehearse-migration.sh` on the real
configuration before deploying (migrations 0009 and 0010). Follow-ups: see the review log.
