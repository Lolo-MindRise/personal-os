import { asc, count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { TagDto } from '../shared/api.js';
import { tagKey, tagUpdateSchema } from '../shared/schemas.js';
import {
  badRequest,
  conflict,
  fieldErrors,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { movementTags, tags } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado la marca.',
  duplicate: 'Ya existe una marca con ese nombre.',
} as const;

function listTags(db: Db): TagDto[] {
  const used = new Map(
    db
      .select({ tagId: movementTags.tagId, n: count() })
      .from(movementTags)
      .groupBy(movementTags.tagId)
      .all()
      .map((r) => [r.tagId, r.n]),
  );
  return db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .orderBy(asc(tags.nameKey))
    .all()
    .map((t) => ({ ...t, movements: used.get(t.id) ?? 0 }));
}

/** Tag management. Tags are created through movements; here they are listed, renamed, deleted. */
export function registerTagsApi(app: FastifyInstance, db: Db): void {
  app.get('/api/tags', () => listTags(db));

  app.patch('/api/tags/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (id === undefined || db.select().from(tags).where(eq(tags.id, id)).get() === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const parsed = tagUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const key = tagKey(parsed.data.name);
    const clash = db.select({ id: tags.id }).from(tags).where(eq(tags.nameKey, key)).get();
    if (clash !== undefined && clash.id !== id) {
      return conflict(reply, MESSAGES.duplicate);
    }
    db.update(tags).set({ name: parsed.data.name, nameKey: key }).where(eq(tags.id, id)).run();
    return listTags(db).find((t) => t.id === id);
  });

  // Only the links go: the movements stay (foreign keys cascade from movement_tags).
  app.delete('/api/tags/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const deleted =
      id === undefined
        ? []
        : db.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id }).all();
    if (deleted.length === 0) {
      return notFound(reply, MESSAGES.notFound);
    }
    return reply.code(204).send();
  });
}
