import { eq } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import type { ApiErrorBody, MovementDto } from '../shared/api.js';
import type { Db } from './db/index.js';
import { accounts, categories, movements } from './db/schema.js';

// Helpers shared by the API route files (movements, recurring items).

export function badRequest(reply: FastifyReply, error: string, fields?: Record<string, string>) {
  const body: ApiErrorBody = fields === undefined ? { error } : { error, fields };
  return reply.code(400).send(body);
}

export function notFound(reply: FastifyReply, error: string) {
  return reply.code(404).send({ error } satisfies ApiErrorBody);
}

export function conflict(reply: FastifyReply, error: string) {
  return reply.code(409).send({ error } satisfies ApiErrorBody);
}

export function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  return fields;
}

export function parseId(raw: string): number | undefined {
  return /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
}

export const MESSAGES = {
  invalid: 'Datos no válidos.',
  invalidMonth: 'El mes debe tener el formato AAAA-MM.',
  invalidKind: 'El tipo debe ser income, expense o repayment.',
  noCategory: 'La categoría no existe.',
  kindMismatch: 'El tipo no coincide con el de la categoría.',
} as const;

/** Checks that a category exists and has the given kind. */
export function categoryError(
  db: Db,
  kind: string,
  categoryId: number,
): { error: string; field: string } | undefined {
  const category = db.select().from(categories).where(eq(categories.id, categoryId)).get();
  if (category === undefined) {
    return { error: MESSAGES.noCategory, field: 'categoryId' };
  }
  if (category.kind !== kind) {
    return { error: MESSAGES.kindMismatch, field: 'kind' };
  }
  return undefined;
}

/** Checks that an account exists. */
export function accountError(
  db: Db,
  accountId: number | undefined,
): { error: string; field: string } | undefined {
  if (
    accountId !== undefined &&
    db.select().from(accounts).where(eq(accounts.id, accountId)).get() === undefined
  ) {
    return { error: 'La cuenta no existe.', field: 'accountId' };
  }
  return undefined;
}

export const movementColumns = {
  id: movements.id,
  date: movements.date,
  kind: movements.kind,
  categoryId: movements.categoryId,
  categoryName: categories.name,
  concept: movements.concept,
  amountCents: movements.amountCents,
  notes: movements.notes,
  debtId: movements.debtId,
  accountId: movements.accountId,
  recurringItemId: movements.recurringItemId,
};

export function getMovement(db: Db, id: number): MovementDto | undefined {
  return db
    .select(movementColumns)
    .from(movements)
    .innerJoin(categories, eq(categories.id, movements.categoryId))
    .where(eq(movements.id, id))
    .get();
}
