# ADR-0005: Recurring items with computed pending entries

**Status:** Accepted
**Date:** 2026-11-24
**Deciders:** Manuel Cardoso

## Context

Manuel's monthly finances include fixed items: rent, loan installments,
subscriptions, salary. Entering them by hand every month is tedious, but
creating them automatically would record payments that have not happened,
with amounts that may differ (electricity varies). For his goals (saving for
a move, paying off a loan) the month's figures must reflect what was really
paid or received.

Chosen behaviour (option C in the discussion): fixed items appear as
**pending** in their month and Manuel **confirms** each one when it is paid
or received, adjusting the amount if needed.

## Decision

Pending entries are **computed, not stored**. The app stores the recurring
items; a month's pending entries are the items due that month that have
neither a confirmed movement nor a skip for that month.

- **Recurring item:** kind (`income`, `expense`, `repayment`), category,
  concept, expected amount, expected day of month, start month, optional
  end month, notes. Same kind/category rule as movements.
- **Confirm:** creates a normal movement linked to the item, pre-filled with
  the expected amount and date (day clamped to the month's length), editable
  before saving. At most one confirmed movement per item and month,
  enforced by the database.
- **Confirm all:** confirms every pending entry of the month with expected
  values.
- **Skip:** marks an item as not applicable for one month; can be undone.
- **Changing an item** affects only future confirmations. Confirmed
  movements are real records and never change with the item.
- **Totals** count only confirmed movements. Pending income, expenses and
  the projected savings are shown separately.
- **Past months** keep showing unconfirmed items as pending.
- Deleting a confirmed movement makes its item pending again.

## Options Considered

| Dimension (weight) | A. Computed on read | B. Rows created at month start |
|---|---|---|
| No duplicated or out-of-sync data (35 %) | 5 | 2 |
| Works even if the app is not opened that month (25 %) | 5 | 2 |
| Simplicity (25 %) | 4 | 3 |
| Performance (15 %) | 4 | 5 |
| **Weighted total** | **4.60** | **2.75** |

B needs a job that runs on the first of each month; the app only runs when
Manuel opens it, so the job would be missed.

## Consequences

- Easier: fixed items take one click per month; the month always shows what
  is still due.
- Harder: every month view computes pending entries (negligible at this scale).
- Later, without rework: link recurring items to the budget and to debts
  (e.g. confirming an installment reduces the debt balance).

## Action Items

1. [x] Task 0007: recurring items, pending entries, screens and tests.
