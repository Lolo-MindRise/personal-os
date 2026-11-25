import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { CategoryDto } from '../shared/api.js';
import { monthOf } from '../shared/recurring.js';
import {
  isoMonth,
  kindSchema,
  movementCreateSchema,
  movementUpdateSchema,
} from '../shared/schemas.js';
import {
  accountError,
  badRequest,
  categoryError,
  fieldErrors,
  getMovement,
  MESSAGES as COMMON_MESSAGES,
  movementColumns,
  setMovementTags,
  withTags,
  type MovementRow,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { deletionTimestamp, liveMovements } from './db/live.js';
import { categories, debts, movements } from './db/schema.js';
import { registerTrashApi } from './trashApi.js';
import { registerAccountsApi } from './accountsApi.js';
import { registerBudgetApi } from './budgetApi.js';
import { registerDashboardApi } from './dashboardApi.js';
import { registerReportsApi } from './reportsApi.js';
import { monthSummary } from './monthSummary.js';
import { registerCategoriesApi } from './categoriesApi.js';
import { registerDataExportApi } from './dataExportApi.js';
import { registerDataImportApi } from './dataImportApi.js';
import { registerDebtsApi } from './debtsApi.js';
import { registerImportApi } from './importApi.js';
import { registerMovementSearchApi } from './movementSearchApi.js';
import { registerProjectionApi } from './projectionApi.js';
import { registerMilestonesApi } from './milestonesApi.js';
import { registerRecurringApi } from './recurringApi.js';
import { registerSummaryApi } from './summaryApi.js';
import { registerTagsApi } from './tagsApi.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado el movimiento.',
  noDebt: 'La deuda no existe.',
  linkedMonth: 'Un movimiento de un fijo debe quedarse en el mes que confirma.',
} as const;

/** Checks the references of a validated movement; returns an error message or undefined. */
function referenceError(
  db: Db,
  m: {
    kind: string;
    categoryId: number;
    debtId?: number | null | undefined;
    accountId?: number | undefined;
  },
): { error: string; field: string } | undefined {
  const problem = categoryError(db, m.kind, m.categoryId) ?? accountError(db, m.accountId);
  if (problem !== undefined) {
    return problem;
  }
  if (
    m.debtId != null &&
    db.select().from(debts).where(eq(debts.id, m.debtId)).get() === undefined
  ) {
    return { error: MESSAGES.noDebt, field: 'debtId' };
  }
  return undefined;
}

export function registerApi(app: FastifyInstance, db: Db): void {
  app.get('/api/categories', (request, reply) => {
    const { kind } = request.query as { kind?: string };
    if (kind !== undefined) {
      const parsed = kindSchema.safeParse(kind);
      if (!parsed.success) {
        return badRequest(reply, MESSAGES.invalidKind, { kind: MESSAGES.invalidKind });
      }
      const rows: CategoryDto[] = db
        .select({ id: categories.id, name: categories.name, kind: categories.kind })
        .from(categories)
        .where(eq(categories.kind, parsed.data))
        .orderBy(asc(categories.name))
        .all();
      return rows;
    }
    const rows: CategoryDto[] = db
      .select({ id: categories.id, name: categories.name, kind: categories.kind })
      .from(categories)
      .orderBy(asc(categories.name))
      .all();
    return rows;
  });

  app.get('/api/movements', (request, reply) => {
    const { month } = request.query as { month?: string };
    const parsed = isoMonth.safeParse(month);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    const rows: MovementRow[] = db
      .select(movementColumns)
      .from(movements)
      .innerJoin(categories, eq(categories.id, movements.categoryId))
      .where(
        and(
          liveMovements(),
          gte(movements.date, `${parsed.data}-01`),
          lte(movements.date, `${parsed.data}-31`),
        ),
      )
      .orderBy(desc(movements.date), desc(movements.id))
      .all();
    return withTags(db, rows);
  });

  app.post('/api/movements', (request, reply) => {
    const parsed = movementCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const refError = referenceError(db, parsed.data);
    if (refError !== undefined) {
      return badRequest(reply, refError.error, { [refError.field]: refError.error });
    }
    const { tags: tagNames, ...values } = parsed.data;
    const createdId = db.transaction((tx) => {
      const created = tx.insert(movements).values(values).returning({ id: movements.id }).get();
      if (tagNames !== undefined) {
        setMovementTags(tx, created.id, tagNames);
      }
      return created.id;
    });
    return reply.code(201).send(getMovement(db, createdId));
  });

  app.patch('/api/movements/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const current =
      id === undefined
        ? undefined
        : db
            .select()
            .from(movements)
            .where(and(liveMovements(), eq(movements.id, id)))
            .get();
    if (id === undefined || current === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const patch = movementUpdateSchema.safeParse(request.body);
    if (!patch.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(patch.error));
    }
    // Merge with the stored row and validate the whole movement, so a change
    // of kind cannot leave a debt on a non-repayment movement.
    const merged = movementCreateSchema.safeParse({
      date: current.date,
      kind: current.kind,
      categoryId: current.categoryId,
      concept: current.concept,
      amountCents: current.amountCents,
      notes: current.notes,
      debtId: current.debtId,
      accountId: current.accountId,
      ...patch.data,
    });
    if (!merged.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(merged.error));
    }
    // A movement that confirms a recurring item belongs to that item's month.
    if (current.recurringItemId !== null && monthOf(merged.data.date) !== monthOf(current.date)) {
      return badRequest(reply, MESSAGES.linkedMonth, { date: MESSAGES.linkedMonth });
    }
    const refError = referenceError(db, merged.data);
    if (refError !== undefined) {
      return badRequest(reply, refError.error, { [refError.field]: refError.error });
    }
    const { tags: tagNames, ...values } = merged.data;
    db.transaction((tx) => {
      tx.update(movements)
        .set({
          ...values,
          notes: values.notes ?? null,
          debtId: values.debtId ?? null,
        })
        .where(eq(movements.id, id))
        .run();
      if (tagNames !== undefined) {
        setMovementTags(tx, id, tagNames);
      }
    });
    return getMovement(db, id);
  });

  app.delete('/api/movements/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const deleted =
      id === undefined
        ? []
        : // To the trash, not gone: `deleted_at` hides it everywhere (trashApi.ts restores it).
          db
            .update(movements)
            .set({ deletedAt: deletionTimestamp() })
            .where(and(liveMovements(), eq(movements.id, id)))
            .returning({ id: movements.id })
            .all();
    if (deleted.length === 0) {
      return notFound(reply, MESSAGES.notFound);
    }
    return reply.code(204).send();
  });

  app.get('/api/months/:month/summary', (request, reply) => {
    const parsed = isoMonth.safeParse((request.params as { month: string }).month);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    return monthSummary(db, parsed.data);
  });

  registerAccountsApi(app, db);
  registerBudgetApi(app, db);
  registerCategoriesApi(app, db);
  registerDashboardApi(app, db);
  registerReportsApi(app, db);
  registerDataExportApi(app, db);
  registerDataImportApi(app, db);
  registerDebtsApi(app, db);
  registerImportApi(app, db);
  registerMovementSearchApi(app, db);
  registerProjectionApi(app, db);
  registerMilestonesApi(app, db);
  registerRecurringApi(app, db);
  registerSummaryApi(app, db);
  registerTagsApi(app, db);
  registerTrashApi(app, db);
}
