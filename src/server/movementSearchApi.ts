import { and, desc, eq, gte, inArray, lte, or, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { MovementDto, MovementSearchDto } from '../shared/api.js';
import { normalizeText } from '../shared/importClassify.js';
import { movementSearchSchema, SEARCH_DEFAULT_PAGE_SIZE } from '../shared/schemas.js';
import { badRequest, fieldErrors, MESSAGES, movementColumns } from './apiCommon.js';
import type { Db } from './db/index.js';
import { categories, movements, recurringItems } from './db/schema.js';

/**
 * Search across all months. Structured filters run in SQL; the text filter runs here so it
 * ignores accents as well as case (SQLite's LIKE only folds ASCII). The data of one person
 * is small enough for that; the totals need every matching row anyway.
 */
export function registerMovementSearchApi(app: FastifyInstance, db: Db): void {
  app.get('/api/movements/search', (request, reply) => {
    const parsed = movementSearchSchema.safeParse(request.query);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const f = parsed.data;

    const conditions: SQL[] = [];
    if (f.categoryId !== undefined) {
      conditions.push(eq(movements.categoryId, f.categoryId));
    }
    if (f.debtId !== undefined) {
      // A debt's movements: extra repayments linked to it, and the installments confirmed from
      // fixed items linked to it.
      conditions.push(
        or(
          eq(movements.debtId, f.debtId),
          inArray(
            movements.recurringItemId,
            db
              .select({ id: recurringItems.id })
              .from(recurringItems)
              .where(eq(recurringItems.debtId, f.debtId)),
          ),
        ) as SQL,
      );
    }
    if (f.recurringItemId !== undefined) {
      conditions.push(eq(movements.recurringItemId, f.recurringItemId));
    }
    if (f.kind !== undefined) {
      conditions.push(eq(movements.kind, f.kind));
    }
    if (f.from !== undefined) {
      conditions.push(gte(movements.date, f.from));
    }
    if (f.to !== undefined) {
      conditions.push(lte(movements.date, f.to));
    }
    if (f.minAmountCents !== undefined) {
      conditions.push(gte(movements.amountCents, f.minAmountCents));
    }
    if (f.maxAmountCents !== undefined) {
      conditions.push(lte(movements.amountCents, f.maxAmountCents));
    }

    let rows: MovementDto[] = db
      .select(movementColumns)
      .from(movements)
      .innerJoin(categories, eq(categories.id, movements.categoryId))
      .where(conditions.length === 0 ? undefined : and(...conditions))
      .orderBy(desc(movements.date), desc(movements.id))
      .all();

    const wanted = normalizeText(f.q ?? '');
    if (wanted !== '') {
      rows = rows.filter(
        (m) =>
          normalizeText(m.concept).includes(wanted) ||
          normalizeText(m.notes ?? '').includes(wanted),
      );
    }

    const totals = { incomeCents: 0, expenseCents: 0, repaymentCents: 0, netCents: 0 };
    for (const m of rows) {
      if (m.kind === 'income') {
        totals.incomeCents += m.amountCents;
      } else if (m.kind === 'expense') {
        totals.expenseCents += m.amountCents;
      } else {
        totals.repaymentCents += m.amountCents;
      }
    }
    totals.netCents = totals.incomeCents - totals.expenseCents - totals.repaymentCents;

    const pageSize = f.pageSize ?? SEARCH_DEFAULT_PAGE_SIZE;
    const page = f.page ?? 1;
    const result: MovementSearchDto = {
      rows: rows.slice((page - 1) * pageSize, page * pageSize),
      page,
      pageSize,
      count: rows.length,
      pageCount: Math.ceil(rows.length / pageSize),
      totals,
    };
    return result;
  });
}
