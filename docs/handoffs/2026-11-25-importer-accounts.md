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

## Next step
- Orchestrator runs the reviewer.
