# Handoff 2026-11-25: Importer and accounts (plan 0003, task 05)

Branch `agent/0003/05-importer-accounts` (from `integration/0003-data-safety-and-daily-use`).

## Done
- Importar has a "Cuenta de destino" selector (default Principal). Commit sends `accountId`;
  the server defaults to Principal, refuses an unknown account (400, field `accountId`) and
  enforces nothing about dates. No schema or migration.
- Rows dated on or before the account's opening date are flagged "Fuera del saldo de la cuenta"
  (with an explanation and a link) and unchecked by default; the user may check them.
- Changing the account re-evaluates the flags (`applyOpeningDate`); rows the user checked or
  unchecked by hand (`touched`) keep their choice.
- The duplicate check and the trash handling of fixed items are untouched.
- Tests: predicate, reducer (boundary: opening date flagged, next day not), PreviewTable render,
  API (account used, default, unknown, old row accepted), e2e `import-accounts.spec.ts`
  (cleans up for good in `finally`).

## Decisions taken
- `src/shared/accountBalance.ts` has no exported predicate and is being edited by another task,
  so `src/shared/importAccount.ts` asks `accountBalance` itself whether a dated movement moves the
  balance. The rule stays in one place; a test pins the agreement. If the reconciliation task
  exports a real predicate, swap the body of `countsInAccountBalance`.
- The link goes to Cuentas (`#/accounts`): `AccountsPage` cannot select an account by URL.
- Duplicate detection is not per account (unchanged).

## Fix round 1
- `withCategory` no longer sets `touched` when filling a missing category; `defaultChecked` counts a
  row with a category as checked by default, so account switches re-evaluate it. Only an explicit
  tick/untick (`withChecked`) is a manual choice. Reducer tests for both directions and for kept
  explicit choices.
- Preview is blocked (button disabled, Spanish message) until accounts load; flags are recomputed
  when they arrive. Test: `previewBlockedMessage`.
- e2e: comment on the Principal opening-date assumption.
- Known limit (pre-existing): `reclassify` (adding/deleting a rule) rebuilds the lines and loses
  manual check choices, including a deliberate "import this flagged row".
- Orchestrator decisions: duplicate detection stays global (key has direction, date, amount,
  concept, so a transfer between own accounts imported from both CSVs is not flagged); the link
  opens `#/accounts` (partial deviation from scope item 3); `countsInAccountBalance` may be swapped
  for an exported predicate later.

## Next step
- Orchestrator runs the reviewer.
