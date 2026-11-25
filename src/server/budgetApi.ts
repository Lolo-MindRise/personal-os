import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { BudgetMonthDto } from '../shared/api.js';
import { buildBudgetMonth } from '../shared/budget.js';
import { budgetLineCreateSchema, isoMonth } from '../shared/schemas.js';
import { badRequest, conflict, fieldErrors, MESSAGES as COMMON_MESSAGES } from './apiCommon.js';
import type { Db } from './db/index.js';
import { liveMovements } from './db/live.js';
import { budgetLines, categories, movements } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  duplicate:
    'Ya hay un presupuesto que empieza ese mes para esta categoría. El historial no se edita: elige otro mes.',
} as const;

export function budgetMonth(db: Db, month: string): BudgetMonthDto {
  const cats = db
    .select({ id: categories.id, name: categories.name, kind: categories.kind })
    .from(categories)
    .all();
  const lines = db.select().from(budgetLines).where(lte(budgetLines.validFrom, month)).all();
  const actual = new Map<number, number>();
  const totals = db
    .select({
      categoryId: movements.categoryId,
      total: sql<number>`coalesce(sum(${movements.amountCents}), 0)`,
    })
    .from(movements)
    .where(
      and(liveMovements(), gte(movements.date, `${month}-01`), lte(movements.date, `${month}-31`)),
    )
    .groupBy(movements.categoryId)
    .all();
  for (const row of totals) {
    actual.set(row.categoryId, row.total);
  }
  return buildBudgetMonth(month, cats, lines, actual);
}

export function registerBudgetApi(app: FastifyInstance, db: Db): void {
  app.get('/api/months/:month/budget', (request, reply) => {
    const month = isoMonth.safeParse((request.params as { month: string }).month);
    if (!month.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    return budgetMonth(db, month.data);
  });

  // Changing a budget adds a line; existing lines are never edited or deleted.
  app.post('/api/budget-lines', (request, reply) => {
    const parsed = budgetLineCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const { categoryId, amountCents, validFrom } = parsed.data;
    if (db.select().from(categories).where(eq(categories.id, categoryId)).get() === undefined) {
      return badRequest(reply, MESSAGES.noCategory, { categoryId: MESSAGES.noCategory });
    }
    const existing = db
      .select()
      .from(budgetLines)
      .where(and(eq(budgetLines.categoryId, categoryId), eq(budgetLines.validFrom, validFrom)))
      .get();
    if (existing !== undefined) {
      return conflict(reply, MESSAGES.duplicate);
    }
    db.insert(budgetLines).values({ categoryId, amountCents, validFrom }).run();
    return reply.code(201).send(budgetMonth(db, validFrom));
  });
}
