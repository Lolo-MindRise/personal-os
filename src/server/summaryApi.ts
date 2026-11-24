import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { GoalDto, SettingsDto, YearSummaryDto } from '../shared/api.js';
import {
  accumulatedAt,
  buildYearSummary,
  goalProgress,
  type SummaryMovement,
} from '../shared/summary.js';
import { goalCreateSchema, goalUpdateSchema, isoDate, settingsSchema } from '../shared/schemas.js';
import {
  badRequest,
  fieldErrors,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import { appSettings, goals, movements } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  goalNotFound: 'No se ha encontrado el objetivo.',
  invalidYear: 'El año debe tener cuatro cifras.',
} as const;

/** Today in the server's local calendar (the same machine as the browser). */
export function localToday(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function readSettings(db: Db): SettingsDto {
  const row = db.select().from(appSettings).where(eq(appSettings.id, 1)).get();
  return row === undefined
    ? { initialSavingsCents: 0, initialSavingsDate: null }
    : { initialSavingsCents: row.initialSavingsCents, initialSavingsDate: row.initialSavingsDate };
}

export function allMovements(db: Db): SummaryMovement[] {
  return db
    .select({ date: movements.date, kind: movements.kind, amountCents: movements.amountCents })
    .from(movements)
    .all();
}

export function goalDtos(db: Db, today: string): GoalDto[] {
  const accumulated = accumulatedAt(readSettings(db), allMovements(db), today);
  return db
    .select()
    .from(goals)
    .orderBy(asc(goals.targetDate), asc(goals.id))
    .all()
    .map((g) => goalProgress(g, accumulated, today));
}

export function registerSummaryApi(app: FastifyInstance, db: Db): void {
  app.get('/api/settings', () => readSettings(db));

  app.put('/api/settings', (request, reply) => {
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    db.insert(appSettings)
      .values({ id: 1, ...parsed.data })
      .onConflictDoUpdate({
        target: appSettings.id,
        set: { ...parsed.data, updatedAt: new Date().toISOString() },
      })
      .run();
    return readSettings(db);
  });

  app.get('/api/years/:year/summary', (request, reply) => {
    const raw = (request.params as { year: string }).year;
    if (!/^\d{4}$/.test(raw)) {
      return badRequest(reply, MESSAGES.invalidYear, { year: MESSAGES.invalidYear });
    }
    const summary: YearSummaryDto = buildYearSummary(
      Number(raw),
      readSettings(db),
      allMovements(db),
    );
    return summary;
  });

  // `?today=YYYY-MM-DD` exists so tests do not depend on the clock; the UI never sends it.
  app.get('/api/goals', (request, reply) => {
    const { today } = request.query as { today?: string };
    if (today !== undefined && !isoDate.safeParse(today).success) {
      return badRequest(reply, MESSAGES.invalid, { today: 'La fecha no es válida.' });
    }
    return goalDtos(db, today ?? localToday());
  });

  app.post('/api/goals', (request, reply) => {
    const parsed = goalCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const created = db.insert(goals).values(parsed.data).returning({ id: goals.id }).get();
    return reply.code(201).send(goalDtos(db, localToday()).find((g) => g.id === created.id));
  });

  app.patch('/api/goals/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    if (id === undefined || db.select().from(goals).where(eq(goals.id, id)).get() === undefined) {
      return notFound(reply, MESSAGES.goalNotFound);
    }
    const patch = goalUpdateSchema.safeParse(request.body);
    if (!patch.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(patch.error));
    }
    if (Object.keys(patch.data).length > 0) {
      db.update(goals).set(patch.data).where(eq(goals.id, id)).run();
    }
    return goalDtos(db, localToday()).find((g) => g.id === id);
  });
}
