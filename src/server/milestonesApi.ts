import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { MilestoneDto } from '../shared/api.js';
import { milestoneCreateSchema, milestoneUpdateSchema } from '../shared/schemas.js';
import {
  badRequest,
  fieldErrors,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { milestones } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  notFound: 'No se ha encontrado el hito.',
} as const;

const columns = {
  id: milestones.id,
  title: milestones.title,
  targetDate: milestones.targetDate,
  status: milestones.status,
  notes: milestones.notes,
};

function getMilestone(db: Db, id: number): MilestoneDto | undefined {
  return db.select(columns).from(milestones).where(eq(milestones.id, id)).get();
}

/** Ordered by target date; the id keeps equal dates in a stable order. */
export function listMilestones(db: Db): MilestoneDto[] {
  return db
    .select(columns)
    .from(milestones)
    .orderBy(asc(milestones.targetDate), asc(milestones.id))
    .all();
}

export function registerMilestonesApi(app: FastifyInstance, db: Db): void {
  app.get('/api/milestones', () => listMilestones(db));

  app.post('/api/milestones', (request, reply) => {
    const parsed = milestoneCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const created = db
      .insert(milestones)
      .values({ ...parsed.data, notes: parsed.data.notes ?? null })
      .returning({ id: milestones.id })
      .get();
    return reply.code(201).send(getMilestone(db, created.id));
  });

  app.patch('/api/milestones/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (id === undefined || getMilestone(db, id) === undefined) {
      return notFound(reply, MESSAGES.notFound);
    }
    const patch = milestoneUpdateSchema.safeParse(request.body);
    if (!patch.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(patch.error));
    }
    const { notes, ...rest } = patch.data;
    // `notes: null` clears the notes; leaving it out keeps them.
    const set = notes === undefined ? rest : { ...rest, notes };
    if (Object.keys(set).length > 0) {
      db.update(milestones).set(set).where(eq(milestones.id, id)).run();
    }
    return getMilestone(db, id);
  });
}
