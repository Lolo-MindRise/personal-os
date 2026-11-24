# Plan 0001: Polish (first orchestrated run)

**Integration branch:** `integration/0001-polish`
**ADRs:** all (0001–0009)

## Goal

Four independent improvements, chosen to test the orchestrator: parallel
work, a dependency between tasks and one likely file overlap.

## Scope

1. **Search filters in the URL.** The movements search panel's own filters
   (text, dates, amounts, category, kind) are kept in the URL, like the
   link filters, so reload and the back button keep them (open deviation
   from task 0015).
2. **Export movements to CSV.** From the movements screen, export the
   current month or the current search results as CSV in Spanish format
   (`;` separator, `dd/mm/yyyy`, `1.234,56`), with a header row. Generated
   in the browser; nothing written on the server.
3. **Backups screen details.** The read-only "Copias" screen shows the
   retention tiers, the oldest restorable date and the mirror state from
   `/api/backups/status`, and a short "how to restore" explanation pointing
   to the README.
4. **Month-over-month on Inicio.** Each key figure on the dashboard shows
   the change against the previous month (amount and direction), with a
   neutral wording ("+120,00 € respecto a octubre").

Task 2 depends on task 1 if both change the movements screen header; the
orchestrator decides the order from the files they touch.

## Out of scope

Data model changes, new dependencies, anything touching the real instance.

## Decisions the orchestrator may take alone

Component structure, labels following `docs/ui-glossary.md`, test layout.

## Decisions reserved for Manuel

None expected. Anything that changes behaviour outside the scope above is a
question.

## Acceptance

- Reload the movements search with filters: they are kept; back button
  restores the previous filters.
- Export a month and open it in Excel: columns, dates and amounts correct.
- "Copias" shows tiers and the oldest restorable date matching
  `restore.sh` listing.
- Inicio shows the month-over-month change on each key figure.

## Constraints

No new dependencies. Maximum 2 parallel implementers.
