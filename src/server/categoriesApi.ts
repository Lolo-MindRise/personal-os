import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { CategoryDto, CategoryUsageDto } from '../shared/api.js';
import { categoryCreateSchema, categoryUpdateSchema } from '../shared/schemas.js';
import {
  badRequest,
  conflict,
  fieldErrors,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { liveMovements, trashedMovements } from './db/live.js';
import { budgetLines, categories, movements, recurringItems } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado la categoría.',
  duplicate: 'Ya existe una categoría con ese nombre.',
  inUse: 'No se puede eliminar: la categoría tiene movimientos, fijos o presupuestos asociados.',
  inTrash: 'No se puede eliminar: hay movimientos eliminados de esta categoría en la papelera.',
} as const;

const columns = { id: categories.id, name: categories.name, kind: categories.kind };

function getCategory(db: Db, id: number): CategoryDto | undefined {
  return db.select(columns).from(categories).where(eq(categories.id, id)).get();
}

/** Names are unique ignoring case and surrounding spaces; `exceptId` skips the row being renamed. */
function nameTaken(db: Db, name: string, exceptId?: number): boolean {
  const wanted = name.trim().toLowerCase();
  return db
    .select(columns)
    .from(categories)
    .all()
    .some((c) => c.id !== exceptId && c.name.trim().toLowerCase() === wanted);
}

type Usage = Pick<CategoryUsageDto, 'movements' | 'recurringItems' | 'budgetLines'>;

/** Usage counts for every category, with one grouped query per table. */
function usageByCategory(db: Db): Map<number, Usage> {
  const result = new Map<number, Usage>();
  const slot = (id: number): Usage => {
    let usage = result.get(id);
    if (usage === undefined) {
      usage = { movements: 0, recurringItems: 0, budgetLines: 0 };
      result.set(id, usage);
    }
    return usage;
  };
  const counts = (table: typeof recurringItems | typeof budgetLines) =>
    db
      .select({ id: table.categoryId, n: sql<number>`count(*)` })
      .from(table)
      .groupBy(table.categoryId)
      .all();
  // The count shown to the user is of movements that exist; the trash is counted apart for the
  // deletion check (`trashedMovementsOf`).
  for (const row of db
    .select({ id: movements.categoryId, n: sql<number>`count(*)` })
    .from(movements)
    .where(liveMovements())
    .groupBy(movements.categoryId)
    .all()) {
    slot(row.id).movements = row.n;
  }
  for (const row of counts(recurringItems)) {
    slot(row.id).recurringItems = row.n;
  }
  for (const row of counts(budgetLines)) {
    slot(row.id).budgetLines = row.n;
  }
  return result;
}

const usageOf = (db: Db, id: number): Usage =>
  usageByCategory(db).get(id) ?? { movements: 0, recurringItems: 0, budgetLines: 0 };

export function registerCategoriesApi(app: FastifyInstance, db: Db): void {
  // Registered before `/:id` routes; the static segment wins in find-my-way anyway.
  app.get('/api/categories/usage', () => {
    const usage = usageByCategory(db);
    const rows: CategoryUsageDto[] = db
      .select(columns)
      .from(categories)
      .orderBy(asc(categories.name))
      .all()
      .map((c) => ({
        ...c,
        ...(usage.get(c.id) ?? { movements: 0, recurringItems: 0, budgetLines: 0 }),
      }));
    return rows;
  });

  app.post('/api/categories', (request, reply) => {
    const parsed = categoryCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    if (nameTaken(db, parsed.data.name)) {
      return conflict(reply, MESSAGES.duplicate);
    }
    const created = db
      .insert(categories)
      .values(parsed.data)
      .returning({ id: categories.id })
      .get();
    return reply.code(201).send(getCategory(db, created.id));
  });

  app.patch('/api/categories/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (id === undefined || getCategory(db, id) === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const parsed = categoryUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    if (nameTaken(db, parsed.data.name, id)) {
      return conflict(reply, MESSAGES.duplicate);
    }
    db.update(categories).set({ name: parsed.data.name }).where(eq(categories.id, id)).run();
    return getCategory(db, id);
  });

  app.delete('/api/categories/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (id === undefined || getCategory(db, id) === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const usage = usageOf(db, id);
    if (usage.movements + usage.recurringItems + usage.budgetLines > 0) {
      return conflict(reply, MESSAGES.inUse);
    }
    // Deliberately counts the trash too: restoring a movement must never find its category gone.
    const inTrash = db
      .select({ n: sql<number>`count(*)` })
      .from(movements)
      .where(and(trashedMovements(), eq(movements.categoryId, id)))
      .get();
    if ((inTrash?.n ?? 0) > 0) {
      return conflict(reply, MESSAGES.inTrash);
    }
    db.delete(categories).where(eq(categories.id, id)).run();
    return reply.code(204).send();
  });
}
