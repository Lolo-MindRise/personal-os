# Plan 0003: Data safety and daily use (long orchestrated run)

**Integration branch:** `integration/0003-data-safety-and-daily-use`
**ADRs:** all (0001–0009)

## Goal

Make real-data changes safe to deploy and mistakes recoverable, and make
daily recording faster. Runs unattended: every design decision Manuel would
be asked is already taken below.

## Scope

0. **Migration rehearsal (first task, alone).** `scripts/rehearse-migration.sh`:
   - Reads the instance configuration like `start.sh`; takes the newest
     local backup (a consistent snapshot, never the live database) and
     copies it to a temporary directory.
   - Counts rows per table, applies the current build's migrations to the
     copy (same migrator as the app, no server needed), counts again.
   - Prints a table: table, rows before, rows after, difference; and the
     migrations applied. Exits non-zero if any table lost rows or a
     migration failed. Deletes the temporary copy unless `--keep` is given.
   - **Never opens the live database or writes anywhere but the temporary
     directory.** Tested only with fixture backups and a temporary instance
     configuration. Agents never run it against the real configuration
     (the guard blocks it); Manuel runs it.
   - README: "Rehearse a deployment" in the real-instance guide, before
     "Update after merging a PR".
   - Draft a short amendment for ADR-0007 (rehearsal mandatory for high-risk
     PRs with migrations) inside the PR description, not in the ADR file:
     Manuel decides.
1. **Importer and accounts.** The CSV importer asks for the target account
   (default Principal). Rows dated on or before that account's opening date
   are flagged "fuera del saldo de la cuenta", unchecked by default, with a
   link to edit the account's opening date.
2. **Undo and trash.**
   - Deleting a movement or a transfer shows "Deshacer" for 10 seconds.
   - Deleted movements and transfers are kept with a deletion date
     (additive migration) and **excluded from every list, total, balance,
     budget, report, projection, dashboard figure, export and import
     duplicate check**.
   - "Papelera" under Ajustes: restore, or delete permanently one by one
     (with confirmation). Nothing is ever deleted automatically.
   - **Required test:** with one deleted movement and one deleted transfer
     present, every endpoint that returns a list, total or balance gives the
     same result as without them. List the endpoints covered in the PR.
3. **Budget alerts.** Inicio lists the current month's categories at or above
   80 % and 100 % of their budget, each linking to its filtered movements.
   Presupuesto shows a progress bar per category with the same thresholds.
4. **Reconciliation.** In Cuentas, "Conciliar" for an account: enter the
   bank's real balance at a date; the app shows its own balance at that date
   and the difference, and the movements since the last reconciliation.
   Reconciliations are stored (additive) and the account shows the last one.
   **No automatic adjustment movements**: Manuel fixes differences himself.
5. **Quick add.** Key `N` opens the new-movement side panel from any screen
   (not while typing in a field). When a concept is typed, suggest the
   category most often used with similar concepts in past movements; the
   suggestion is visible and never applied without Manuel choosing it.
6. **CSV export:** add the account column.

## Out of scope

Expense sharing, automatic purging, automatic reconciliation adjustments,
bank connections, anything touching the real instance.

## Decisions the orchestrator may take alone

Task split and order (task 0 first and alone), component structure, labels
following `docs/ui-glossary.md` (add new terms), test layout.

## Decisions reserved for Manuel

Any change to how income, expenses, savings or balances are calculated
beyond excluding deleted rows. Any non-additive migration.

## Acceptance

- `scripts/rehearse-migration.sh` on a fixture backup prints per-table
  counts, and fails when a fixture migration deletes rows.
- Delete a movement, undo within 10 s: it is back. Delete it again, wait:
  it is in Papelera; totals are unchanged by its presence; restore works.
- Import a CSV into Ahorro with a row older than Ahorro's opening date: the
  row is flagged and unchecked.
- A category at 85 % of budget appears on Inicio.
- Reconcile with a balance 10 € different: the difference shows 10 €.
- Press N on Informes: the new-movement panel opens.

## Constraints

No new dependencies. Maximum 2 parallel implementers. Additive migrations
only. Stop only for the orchestrator protocol's stop conditions.
