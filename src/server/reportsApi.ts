import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { reportWindows, type ExpenseReportDto, isReportPeriod } from '../shared/reports.js';
import { isoMonth } from '../shared/schemas.js';
import { badRequest, MESSAGES as COMMON_MESSAGES } from './apiCommon.js';
import type { Db } from './db/index.js';
import { categories, movements } from './db/schema.js';
import { localToday } from './summaryApi.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  invalidPeriod: 'El periodo debe ser de 3, 6 o 12 meses.',
} as const;

/**
 * Expense totals per category and month for the `count` months ending at `month` and the `count`
 * before them. Same definition as the budget and the movements screen: confirmed expense
 * movements, summed by their category and the month of their date.
 */
export function expenseReport(db: Db, month: string, count: number): ExpenseReportDto {
  const { months, previousMonths } = reportWindows(month, count);
  const first = previousMonths[0] ?? month;
  const rows = db
    .select({
      month: sql<string>`substr(${movements.date}, 1, 7)`,
      categoryId: movements.categoryId,
      cents: sql<number>`coalesce(sum(${movements.amountCents}), 0)`,
    })
    .from(movements)
    .where(
      and(
        eq(movements.kind, 'expense'),
        gte(movements.date, `${first}-01`),
        lte(movements.date, `${months[months.length - 1] ?? month}-31`),
      ),
    )
    .groupBy(sql`substr(${movements.date}, 1, 7)`, movements.categoryId)
    .all();
  const names = db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.kind, 'expense'))
    .orderBy(asc(categories.name))
    .all();
  return { month, months: count, categories: names, totals: rows };
}

export function registerReportsApi(app: FastifyInstance, db: Db): void {
  app.get('/api/reports/expenses', (request, reply) => {
    const query = request.query as { month?: string; months?: string };
    const month = isoMonth.safeParse(query.month ?? localToday().slice(0, 7));
    if (!month.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    const count = Number(query.months ?? '6');
    if (!isReportPeriod(count)) {
      return badRequest(reply, MESSAGES.invalidPeriod, { months: MESSAGES.invalidPeriod });
    }
    return expenseReport(db, month.data, count);
  });
}
