import { asc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { ProjectionDto } from '../shared/api.js';
import {
  addMonths,
  MAX_PROJECTION_MONTHS,
  projectMonths,
  type ProjectionRecurring,
} from '../shared/projection.js';
import { daysInMonth } from '../shared/recurring.js';
import { projectionQuerySchema } from '../shared/schemas.js';
import { accumulatedAt, monthsBetween } from '../shared/summary.js';
import { badRequest, fieldErrors, MESSAGES } from './apiCommon.js';
import type { Db } from './db/index.js';
import { liveMovements } from './db/live.js';
import { confirmedItemIds, listRecurringItems } from './db/recurring.js';
import { budgetLines, categories, goals, movements, recurringSkips } from './db/schema.js';
import { allMovements, localToday, readSettings } from './summaryApi.js';

const MONTHS_AHEAD_DEFAULT = 11;

const PROJECTION_MESSAGES = {
  beforeToday: 'El mes final no puede ser anterior al mes actual.',
  tooFar: `El mes final no puede estar a más de ${String(MAX_PROJECTION_MONTHS)} meses.`,
} as const;

/** Gathers the inputs of the projection from the database; the arithmetic is in shared/projection. */
export function buildProjection(db: Db, today: string, endMonth: string): ProjectionDto {
  const settings = readSettings(db);
  const currentMonth = today.slice(0, 7);
  const previous = addMonths(currentMonth, -1);

  // Where the projection starts: the savings at the end of the previous month (the initial
  // balance when that month ends before its date).
  const baselineCents = accumulatedAt(
    settings,
    allMovements(db),
    `${previous}-${String(daysInMonth(previous)).padStart(2, '0')}`,
  );

  // What already happened this month, by category. Movements on or before the initial balance's
  // date are inside that balance, so they are not counted again.
  const actualByCategory = new Map<number, number>();
  for (const m of db
    .select({
      date: movements.date,
      categoryId: movements.categoryId,
      cents: movements.amountCents,
    })
    .from(movements)
    .where(liveMovements())
    .all()) {
    const counts =
      m.date.slice(0, 7) === currentMonth &&
      (settings.initialSavingsDate === null || m.date > settings.initialSavingsDate);
    if (counts) {
      actualByCategory.set(m.categoryId, (actualByCategory.get(m.categoryId) ?? 0) + m.cents);
    }
  }

  const categoryRows = db
    .select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories)
    .orderBy(asc(categories.name))
    .all();
  const recurring: ProjectionRecurring[] = listRecurringItems(db).map((item) => ({
    id: item.id,
    kind: item.kind,
    categoryId: item.categoryId,
    amountCents: item.amountCents,
    startMonth: item.startMonth,
    endMonth: item.endMonth,
  }));
  const settled = [
    ...db
      .select({ itemId: recurringSkips.recurringItemId, month: recurringSkips.month })
      .from(recurringSkips)
      .all(),
    ...[...confirmedItemIds(db, currentMonth)].map((itemId) => ({ itemId, month: currentMonth })),
  ];

  return {
    currentMonth,
    endMonth,
    baselineCents,
    months: projectMonths({
      currentMonth,
      endMonth,
      baselineCents,
      categories: categoryRows,
      recurring,
      budgetLines: db.select().from(budgetLines).all(),
      actualByCategory,
      settled,
    }),
    categories: categoryRows,
    goals: db
      .select({
        id: goals.id,
        name: goals.name,
        targetAmountCents: goals.targetAmountCents,
        targetDate: goals.targetDate,
      })
      .from(goals)
      .orderBy(asc(goals.targetDate), asc(goals.id))
      .all(),
  };
}

export function registerProjectionApi(app: FastifyInstance, db: Db): void {
  // `?today=YYYY-MM-DD` exists so tests and the page do not depend on the server's clock.
  app.get('/api/projection', (request, reply) => {
    const parsed = projectionQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const today = parsed.data.today ?? localToday();
    const currentMonth = today.slice(0, 7);
    const endMonth = parsed.data.to ?? addMonths(currentMonth, MONTHS_AHEAD_DEFAULT);
    if (endMonth < currentMonth) {
      return badRequest(reply, PROJECTION_MESSAGES.beforeToday, {
        to: PROJECTION_MESSAGES.beforeToday,
      });
    }
    if (monthsBetween(currentMonth, endMonth) + 1 > MAX_PROJECTION_MONTHS) {
      return badRequest(reply, PROJECTION_MESSAGES.tooFar, { to: PROJECTION_MESSAGES.tooFar });
    }
    return buildProjection(db, today, endMonth);
  });
}
