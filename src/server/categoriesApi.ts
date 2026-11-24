import { asc, eq, sql } from 'drizzle-orm';
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
import { budgetLines, categories, movements, recurringItems } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado la categoría.',
  duplicate: 'Ya existe una categoría con ese nombre.',
  inUse: 'No se puede eliminar: la categoría tiene movimientos, fijos o presupuestos asociados.',
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

function usageOf(db: Db, id: number) {
  const count = (table: typeof movements | typeof recurringItems | typeof budgetLines) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(table)
      .where(eq(table.categoryId, id))
      .get()?.n ?? 0;
  return {
    movements: count(movements),
    recurringItems: count(recurringItems),
    budgetLines: count(budgetLines),
  };
}

export function registerCategoriesApi(app: FastifyInstance, db: Db): void {
  // Registered before `/:id` routes; the static segment wins in find-my-way anyway.
  app.get('/api/categories/usage', () => {
    const rows: CategoryUsageDto[] = db
      .select(columns)
      .from(categories)
      .orderBy(asc(categories.name))
      .all()
      .map((c) => ({ ...c, ...usageOf(db, c.id) }));
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
    db.delete(categories).where(eq(categories.id, id)).run();
    return reply.code(204).send();
  });
}
