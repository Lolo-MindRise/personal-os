import { eq, inArray } from 'drizzle-orm';
import type { FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import type { ApiErrorBody, MovementDto } from '../shared/api.js';
import { tagKey } from '../shared/schemas.js';
import type { Db } from './db/index.js';
import { accounts, categories, movements, movementTags, tags } from './db/schema.js';

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
  field = 'accountId',
): { error: string; field: string } | undefined {
  if (
    accountId !== undefined &&
    db.select().from(accounts).where(eq(accounts.id, accountId)).get() === undefined
  ) {
    return { error: 'La cuenta no existe.', field };
  }
  return undefined;
}

/** What a `db.transaction` callback receives. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** A movement row as selected with `movementColumns`, before its tags are attached. */
export type MovementRow = Omit<MovementDto, 'tags'>;

/** Adds each movement's tag names (alphabetical) with one query for the whole list. */
export function withTags(db: Db, rows: MovementRow[]): MovementDto[] {
  if (rows.length === 0) {
    return [];
  }
  const links = db
    .select({ movementId: movementTags.movementId, name: tags.name })
    .from(movementTags)
    .innerJoin(tags, eq(tags.id, movementTags.tagId))
    .where(
      inArray(
        movementTags.movementId,
        rows.map((r) => r.id),
      ),
    )
    .all();
  const byMovement = new Map<number, string[]>();
  for (const link of links) {
    byMovement.set(link.movementId, [...(byMovement.get(link.movementId) ?? []), link.name]);
  }
  return rows.map((row) => ({
    ...row,
    tags: (byMovement.get(row.id) ?? []).sort((a, b) => a.localeCompare(b, 'es')),
  }));
}

/**
 * Makes `names` the tags of a movement: tags that do not exist yet are created, matching existing
 * ones ignoring case and surrounding spaces. Replaces the previous links (never touches movements).
 */
export function setMovementTags(db: Db | Tx, movementId: number, names: string[]): void {
  const wanted = new Map<string, string>();
  for (const name of names) {
    const key = tagKey(name);
    if (key !== '' && !wanted.has(key)) {
      wanted.set(key, name.trim());
    }
  }
  const tagIds: number[] = [];
  for (const [key, name] of wanted) {
    const existing = db.select({ id: tags.id }).from(tags).where(eq(tags.nameKey, key)).get();
    tagIds.push(
      existing?.id ??
        db.insert(tags).values({ name, nameKey: key }).returning({ id: tags.id }).get().id,
    );
  }
  db.delete(movementTags).where(eq(movementTags.movementId, movementId)).run();
  if (tagIds.length > 0) {
    db.insert(movementTags)
      .values(tagIds.map((tagId) => ({ movementId, tagId })))
      .run();
  }
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
  const row: MovementRow | undefined = db
    .select(movementColumns)
    .from(movements)
    .innerJoin(categories, eq(categories.id, movements.categoryId))
    .where(eq(movements.id, id))
    .get();
  return row === undefined ? undefined : withTags(db, [row])[0];
}
