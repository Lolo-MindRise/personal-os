# Task 0013: Long autonomous session (four blocks)

**Branches:** `agent/session/01-debt-installments` … `agent/session/04-projection`
**ADRs:** all (0001–0006)

## Protocol

Follow the **run protocol** and **hard rules** of
`docs/tasks/0008-overnight-run.md`, with these changes:
- Step 1: confirm that task 0012 (backup retention) is merged into `main`.
  If it is not, stop and say so.
- PR titles are prefixed `[session N/4]`; the handoff is
  `docs/handoffs/<today>-long-session.md`.
- Create and edit every file with the file tools (Write, Edit). Not with
  shell heredocs, `echo`/`cat` redirection or scripts that write files.
  Previous runs broke this rule three times.

Manuel is away. Never ask him anything during the run; take the most
reasonable decision consistent with the ADRs and record it.

## Blocks

### 1. Loan installments reduce the debt balance

Today the estimated balance only subtracts extra repayments, so the debt
progress bar barely moves while regular installments are being paid.
- Recurring items can optionally be linked to a debt (additive migration).
- When a linked recurring item is confirmed in a month, the debt's
  estimated balance is reduced by the **principal part** of that
  installment, using the debt's annual rate (French amortization: interest
  = balance × monthly rate; principal = payment − interest). Extra
  repayments keep reducing it on their own dates. Compute in date order
  from the balance's as-of date.
- The debts screen and the dashboard show the new estimate; remove the
  "regular installments are not deducted" notice; show the interest paid
  so far next to the principal.
- The recurring item form lets you choose the debt.
- Tests: amortization against a known schedule (to the cent, with
  rounding rules documented), installments plus extra repayments,
  installments confirmed out of order, a debt paid off (balance never
  below zero).

### 2. Import movements from a bank CSV

Manuel's bank exports CSV statements. Build a generic importer.
- "Importar" screen: choose a CSV file (it is read in the browser and sent
  to the API; never stored on disk except as the resulting movements).
- Detect the delimiter (`;` or `,`) and handle quoted fields and a
  header row. Map columns in the UI: date, concept, amount, and optionally
  a separate debit/credit pair instead of a signed amount. Spanish formats:
  `dd/mm/yyyy` and `1.234,56`; negative amounts are expenses.
- Remember the last column mapping (additive settings storage).
- Preview every row before importing: parsed date, concept, amount, kind,
  proposed category, and status.
- **Category rules:** "concept contains X → category Y", managed on the
  same screen and applied to the preview (additive table).
- **Duplicates:** a row matching an existing movement (same date, amount
  and concept) is flagged and unchecked by default.
- **Recurring items:** a row matching a pending recurring item of that
  month (same kind and amount) is proposed as its confirmation instead of
  a new movement.
- Import only the checked rows, in one transaction; show a summary.
- Tests use invented CSV fixtures only (several formats, malformed lines,
  duplicates, recurring matches). E2E: import a small file end to end.

### 3. Search and filter movements

On the movements screen, a filter panel across all months: text in
concept or notes, category, kind, date range, amount range. Results list
with the total of the filtered set and a clear way to go back to the
monthly view. The API supports the same filters with pagination.

### 4. Projection and scenarios

A "Proyección" screen answering "how much will I have saved by date X?".
- From the current month to a chosen end month: project each month with
  active recurring items (income and expenses, respecting start and end
  months) plus the budget of categories without recurring items.
  Start from current accumulated savings.
- Show projected accumulated savings as a line, with the goals' targets
  and dates marked.
- **Scenarios** (not saved; live in the page): add adjustments such as
  "from month M, monthly income +X" or "from month M, expense category C
  becomes Y". Show the base projection and the scenario side by side.
- Explain under the chart what the projection includes and excludes.
- Tests: projection arithmetic across years, recurring start/end months,
  scenarios applied from the right month.

## Out of scope

Expense sharing between two people, stored scenarios, bank connections,
anything touching the real instance.

## Done when

Each finished block has its PR open with both CI jobs green and the
reviewer verdict in it, and the handoff says exactly where the run ended.
