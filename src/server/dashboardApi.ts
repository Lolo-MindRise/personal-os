import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { DashboardDto } from '../shared/api.js';
import {
  debtProgressPercent,
  monthRows,
  monthsEnding,
  nextGoal,
  upcomingMilestones,
} from '../shared/dashboard.js';
import { isoDate, isoMonth } from '../shared/schemas.js';
import { accumulatedAt } from '../shared/summary.js';
import { badRequest, MESSAGES as COMMON_MESSAGES } from './apiCommon.js';
import { budgetMonth } from './budgetApi.js';
import { listDebts } from './debtsApi.js';
import type { Db } from './db/index.js';
import { dueEntries } from './db/recurring.js';
import { budgetLines, debts, goals, movements } from './db/schema.js';
import { listMilestones } from './milestonesApi.js';
import { monthSummary } from './monthSummary.js';
import { allMovements, goalDtos, localToday, readSettings } from './summaryApi.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  invalidToday: 'La fecha no es válida.',
} as const;

function countRows(
  db: Db,
  table: typeof goals | typeof budgetLines | typeof debts | typeof movements,
) {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(table)
      .get()?.n ?? 0
  );
}

/**
 * Everything the home screen needs for `month`. Only arranges what the other screens already
 * compute (month summary, yearly rows, budget, debts, goals, pending entries, milestones).
 */
export function buildDashboard(db: Db, month: string, today: string): DashboardDto {
  const settings = readSettings(db);
  const all = allMovements(db);
  const lastDay = `${month}-31`; // the comparison is textual: any day of the month is <= this
  const summary = monthSummary(db, month);

  const debtItems = listDebts(db).map((d) => ({
    id: d.id,
    name: d.name,
    estimatedBalanceCents: d.estimatedBalanceCents,
    remainingInstallments: d.remainingInstallments,
    monthlyPaymentCents: d.monthlyPaymentCents,
    recordedBalanceCents: d.balanceCents,
    balanceAsOf: d.balanceAsOf,
    repaidSinceCents: d.repaidSinceCents,
    progressPercent: debtProgressPercent(d.balanceCents, d.repaidSinceCents),
  }));
  const totalEstimatedCents = debtItems.reduce((sum, d) => sum + d.estimatedBalanceCents, 0);

  const categories = budgetMonth(db, month)
    .rows.filter((r) => r.kind === 'expense' && (r.actualCents > 0 || r.budgetCents !== null))
    .map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName,
      budgetCents: r.budgetCents,
      actualCents: r.actualCents,
      overBudget: r.budgetCents !== null && r.actualCents > r.budgetCents,
    }));

  return {
    month,
    today,
    setup: {
      initialBalance: settings.initialSavingsDate !== null,
      movements: countRows(db, movements) > 0,
      goals: countRows(db, goals) > 0,
      budget: countRows(db, budgetLines) > 0,
      debts: countRows(db, debts) > 0,
    },
    keyFigures: {
      accumulatedSavingsCents: accumulatedAt(settings, all, lastDay),
      nextGoal: nextGoal(goalDtos(db, today), today),
      totalDebtCents: totalEstimatedCents,
      projectedSavingsCents: summary.projectedSavingsCents,
    },
    months: monthRows(monthsEnding(month), settings, all),
    categories,
    debts: { items: debtItems, totalEstimatedCents },
    upcoming: {
      pending: dueEntries(db, month).pending,
      milestones: upcomingMilestones(listMilestones(db), today),
    },
  };
}

export function registerDashboardApi(app: FastifyInstance, db: Db): void {
  // `today` exists so tests do not depend on the clock; the UI never sends it.
  app.get('/api/dashboard', (request, reply) => {
    const query = request.query as { month?: string; today?: string };
    const today = query.today ?? localToday();
    if (!isoDate.safeParse(today).success) {
      return badRequest(reply, MESSAGES.invalid, { today: MESSAGES.invalidToday });
    }
    const month = isoMonth.safeParse(query.month ?? today.slice(0, 7));
    if (!month.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    return buildDashboard(db, month.data, today);
  });
}
