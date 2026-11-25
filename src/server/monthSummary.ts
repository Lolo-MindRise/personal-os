import { and, gte, lte, sql } from 'drizzle-orm';
import type { MonthSummaryDto } from '../shared/api.js';
import type { Db } from './db/index.js';
import { liveMovements } from './db/live.js';
import { dueEntries } from './db/recurring.js';
import { movements } from './db/schema.js';

/**
 * Totals of a month: confirmed movements only; pending recurring entries are reported apart
 * (ADR-0005). Used by `GET /api/months/:month/summary` and by the dashboard.
 */
export function monthSummary(db: Db, month: string): MonthSummaryDto {
  const totals = db
    .select({
      kind: movements.kind,
      total: sql<number>`coalesce(sum(${movements.amountCents}), 0)`,
    })
    .from(movements)
    .where(
      and(liveMovements(), gte(movements.date, `${month}-01`), lte(movements.date, `${month}-31`)),
    )
    .groupBy(movements.kind)
    .all();
  const sumOf = (kind: string) => totals.find((row) => row.kind === kind)?.total ?? 0;
  const incomeCents = sumOf('income');
  const expenseCents = sumOf('expense');
  const repaymentCents = sumOf('repayment');
  const savingsCents = incomeCents - expenseCents - repaymentCents;

  const pending = dueEntries(db, month).pending;
  const pendingOf = (kind: string) =>
    pending.filter((e) => e.kind === kind).reduce((sum, e) => sum + e.amountCents, 0);
  const pendingIncomeCents = pendingOf('income');
  const pendingExpenseCents = pendingOf('expense');
  const pendingRepaymentCents = pendingOf('repayment');

  return {
    month,
    incomeCents,
    expenseCents,
    repaymentCents,
    savingsCents,
    pendingIncomeCents,
    pendingExpenseCents,
    pendingRepaymentCents,
    projectedSavingsCents:
      savingsCents + pendingIncomeCents - pendingExpenseCents - pendingRepaymentCents,
  };
}
