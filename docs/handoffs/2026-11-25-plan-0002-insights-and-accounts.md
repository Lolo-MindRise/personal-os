# Handoff 2026-11-25: Plan 0002 Insights and accounts (orchestrated run)

Integration branch `integration/0002-insights-and-accounts`, one PR to `main` for Manuel. Risk: high.

## Done
All seven tasks merged, each with reviewer verdicts and green CI on its task PR; full checks
(lint, typecheck, test, test:e2e, build) green on integration after every merge.
- 00 Lint ignores `.claude/worktrees/` (#53).
- 01 Accounts, "Principal", account selector on movements; migration 0006 (#54).
- 02 Informes (reports) screen (#55). 3 rounds.
- 03 Transfers, balances, Cuentas screen; migration 0007 (#56). 3 rounds.
- 04 Tags ("marcas"); migration 0008 (#58).
- 05 Inicio: account balances and next 30 days (#57).
- 06 Full data export and import from Copias (#59). 1 fix round.

## Decisions taken by the orchestrator
- Principal opens the day before the earliest movement ('2025-12-31' if none), so its balance
  includes every movement. This edited migration 0006 on the integration branch (never on main).
  Dev databases created from integration before that edit must be recreated.
- Account rule: movements and transfers count strictly after the opening date. New accounts
  default to yesterday; transfers on or before either opening date are refused.
- Informes: averages and "changed most" rows link to the whole period (cat/from/to).
- Tags shown as "marcas" in the UI; several tags in a filter means all must match.
- CSV export gains a last "Marcas" column.
- Data import: refused unless every table is empty (account 1 untouched); never logs row data.

## Blocked
None.

## Problems found
- `gh pr edit` fails (Projects classic GraphQL error); #54's body is another task's text.
- Brief 03 and 06 reviews added notes to later briefs; handled in `docs/plans/0002/tasks/`.
- Known limits per task are in `docs/metrics/review-log.md` (backdated movements before an
  opening date are excluded from balances without warning; follow-up).

## Next step
Manuel: review and merge the plan PR; recreate any dev database made from integration earlier.
Manual test: none required; optional export from one dev database and import into an empty one.
