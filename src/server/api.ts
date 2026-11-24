import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import type { ApiErrorBody, CategoryDto, MonthSummaryDto, MovementDto } from '../shared/api.js';
import {
  isoMonth,
  kindSchema,
  movementCreateSchema,
  movementUpdateSchema,
} from '../shared/schemas.js';
import type { Db } from './db/index.js';
import { categories, debts, movements } from './db/schema.js';

const MESSAGES = {
  invalid: 'Datos no válidos.',
  invalidMonth: 'El mes debe tener el formato AAAA-MM.',
  invalidKind: 'El tipo debe ser income, expense o repayment.',
  notFound: 'No se ha encontrado el movimiento.',
  noCategory: 'La categoría no existe.',
  kindMismatch: 'El tipo del movimiento no coincide con el de la categoría.',
  noDebt: 'La deuda no existe.',
} as const;

function badRequest(reply: FastifyReply, error: string, fields?: Record<string, string>) {
  const body: ApiErrorBody = fields === undefined ? { error } : { error, fields };
  return reply.code(400).send(body);
}

function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

function parseId(raw: string): number | undefined {
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
}

const movementColumns = {
  id: movements.id,
  date: movements.date,
  kind: movements.kind,
  categoryId: movements.categoryId,
  categoryName: categories.name,
  concept: movements.concept,
  amountCents: movements.amountCents,
  notes: movements.notes,
  debtId: movements.debtId,
};

function getMovement(db: Db, id: number): MovementDto | undefined {
  return db
    .select(movementColumns)
    .from(movements)
    .innerJoin(categories, eq(categories.id, movements.categoryId))
    .where(eq(movements.id, id))
    .get();
}

/** Checks the references of a validated movement; returns an error message or undefined. */
function referenceError(
  db: Db,
  m: { kind: string; categoryId: number; debtId?: number | null | undefined },
): { error: string; field: string } | undefined {
  const category = db.select().from(categories).where(eq(categories.id, m.categoryId)).get();
  if (category === undefined) {
    return { error: MESSAGES.noCategory, field: 'categoryId' };
  }
  if (category.kind !== m.kind) {
    return { error: MESSAGES.kindMismatch, field: 'kind' };
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
    const rows: MovementDto[] = db
      .select(movementColumns)
      .from(movements)
      .innerJoin(categories, eq(categories.id, movements.categoryId))
      .where(
        and(gte(movements.date, `${parsed.data}-01`), lte(movements.date, `${parsed.data}-31`)),
      )
      .orderBy(desc(movements.date), desc(movements.id))
      .all();
    return rows;
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
    const created = db.insert(movements).values(parsed.data).returning({ id: movements.id }).get();
    return reply.code(201).send(getMovement(db, created.id));
  });

  app.patch('/api/movements/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const current =
      id === undefined ? undefined : db.select().from(movements).where(eq(movements.id, id)).get();
    if (id === undefined || current === undefined) {
      return reply.code(404).send({ error: MESSAGES.notFound } satisfies ApiErrorBody);
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
      ...patch.data,
    });
    if (!merged.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(merged.error));
    }
    const refError = referenceError(db, merged.data);
    if (refError !== undefined) {
      return badRequest(reply, refError.error, { [refError.field]: refError.error });
    }
    db.update(movements)
      .set({
        ...merged.data,
        notes: merged.data.notes ?? null,
        debtId: merged.data.debtId ?? null,
      })
      .where(eq(movements.id, id))
      .run();
    return getMovement(db, id);
  });

  app.delete('/api/movements/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const deleted =
      id === undefined
        ? []
        : db.delete(movements).where(eq(movements.id, id)).returning({ id: movements.id }).all();
    if (deleted.length === 0) {
      return reply.code(404).send({ error: MESSAGES.notFound } satisfies ApiErrorBody);
    }
    return reply.code(204).send();
  });

  app.get('/api/months/:month/summary', (request, reply) => {
    const parsed = isoMonth.safeParse((request.params as { month: string }).month);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    const totals = db
      .select({
        kind: movements.kind,
        total: sql<number>`coalesce(sum(${movements.amountCents}), 0)`,
      })
      .from(movements)
      .where(
        and(gte(movements.date, `${parsed.data}-01`), lte(movements.date, `${parsed.data}-31`)),
      )
      .groupBy(movements.kind)
      .all();
    const sumOf = (kind: string) => totals.find((row) => row.kind === kind)?.total ?? 0;
    const incomeCents = sumOf('income');
    const expenseCents = sumOf('expense');
    const repaymentCents = sumOf('repayment');
    const summary: MonthSummaryDto = {
      month: parsed.data,
      incomeCents,
      expenseCents,
      repaymentCents,
      savingsCents: incomeCents - expenseCents - repaymentCents,
    };
    return summary;
  });
}
