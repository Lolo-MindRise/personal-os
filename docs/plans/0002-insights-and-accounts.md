# Plan 0002: Insights and accounts (overnight orchestrated run)

**Integration branch:** `integration/0002-insights-and-accounts`
**ADRs:** all (0001–0009)

## Goal

Understand where the money goes, track it per account, and make the data
portable. Runs overnight: Manuel reviews one PR in the morning. Every design
decision he would normally be asked is already taken below.

## Scope

0. **Housekeeping (first task, alone).** `eslint .` runs out of memory
   because it also scans `.claude/worktrees/`. Ignore that folder in
   `eslint.config.js` and `.prettierignore`, so lint runs plainly in every
   worktree and on integration.
1. **Reports screen ("Informes", under Seguimiento).** For a chosen period
   (last 3, 6 or 12 months): expenses by category per month (stacked bars),
   one category's trend (line), monthly average per category, and the five
   categories whose spending changed most versus the previous period of the
   same length. Every element links to the filtered movements.
2. **Accounts.**
   - Accounts with name, type (`bank`, `cash`, `savings`), opening balance
     and its date. Additive migrations only.
   - A migration creates the account "Principal" and assigns every existing
     movement to it. New movements default to "Principal".
   - Movements and confirmed fixed items get an account selector.
   - **Transfers** between two accounts: a separate entity, never a movement
     of kind income or expense. **Transfers do not change income, expenses,
     savings, budget, projection or the dashboard totals**; they only move
     balances between accounts.
   - Account balance = opening balance + movements on that account after
     its date ± transfers. "Cuentas" screen under Ajustes with balances.
3. **Tags.** Free tags on movements (many per movement), created on the fly
   in the movement form; filter by tag in the movements search (in the URL,
   like the other filters); a tag management list (rename, delete; deleting
   a tag never deletes movements).
4. **Full data export and import.**
   - "Exportar datos": one JSON file with every table, a format version and
     the export date, downloaded from the browser.
   - "Importar datos": accepted **only when the database has no movements,
     categories or recurring items**; otherwise refused with a clear
     message. Validates the whole file before writing anything; all or
     nothing in one transaction; the database must be identical after an
     export → import round trip (tested).
   - The importer is reached from "Copias", with a warning that it is for
     moving to a new installation, not for restoring backups (README
     "Restore a backup" remains the way to restore).
5. **Dashboard additions** (depends on 2): account balances, and fixed items
   and milestones due in the next 30 days, each linking to its screen.

## Out of scope

Expense sharing between two people, bank connections, multiple currencies,
attachments, anything touching the real instance.

## Decisions the orchestrator may take alone

Component and file structure, task split and order, labels following
`docs/ui-glossary.md` (add new terms to it), chart layout within the design
system, test layout.

## Decisions reserved for Manuel

- Any change to how income, expenses or savings are calculated beyond the
  transfer rule above.
- Any migration that is not purely additive (the migration check will
  refuse it anyway).
Anything else unclear: take the most conservative option and record it.

## Acceptance

- Informes: the 12-month view matches the movements screen totals per
  category for two months picked at random.
- A transfer of 100 € from Principal to Ahorro changes both balances and
  leaves the dashboard savings unchanged.
- Existing movements appear under Principal after the migration, and the
  migration keeps every row (test).
- Tag a movement, filter by the tag, reload: the filter stays.
- Export, reset a development database, import: the app shows the same data.
- Import into a database with data is refused.

## Constraints

No new dependencies. Maximum 2 parallel implementers. Additive migrations
only. Stop the run only for the stop conditions in the orchestrator protocol.
