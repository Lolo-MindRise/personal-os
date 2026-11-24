import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { MovementDto, PendingEntryDto, RecurringItemDto } from '../shared/api.js';
import { isDueInMonth, monthOf } from '../shared/recurring.js';
import {
  confirmOverridesSchema,
  isoMonth,
  recurringItemCreateSchema,
  recurringItemUpdateSchema,
} from '../shared/schemas.js';
import {
  badRequest,
  categoryError,
  conflict,
  fieldErrors,
  getMovement,
  MESSAGES as COMMON_MESSAGES,
  notFound,
  parseId,
} from './apiCommon.js';
import type { Db } from './db/index.js';
import {
  confirmedItemIds,
  dueEntries,
  getRecurringItem,
  listRecurringItems,
  skippedItemIds,
  toEntry,
} from './db/recurring.js';
import { movements, recurringItems, recurringSkips } from './db/schema.js';

const MESSAGES = {
  ...COMMON_MESSAGES,
  itemNotFound: 'No se ha encontrado el fijo.',
  skipNotFound: 'Ese fijo no está saltado en ese mes.',
  notDue: 'El fijo no corresponde a ese mes.',
  alreadyConfirmed: 'Este fijo ya está confirmado en ese mes.',
  alreadySkipped: 'Este fijo ya está saltado en ese mes.',
  skippedBlocksConfirm: 'Este fijo está saltado en ese mes. Deshaz el salto para confirmarlo.',
  dateOutsideMonth: (month: string) => `La fecha debe estar dentro del mes ${month}.`,
} as const;

type Lookup =
  | { ok: true; item: RecurringItemDto; month: string }
  | { ok: false; status: 400 | 404; error: string; fields?: Record<string, string> };

/** Resolves `:id` and `:month` of the confirm and skip routes. */
function lookup(db: Db, rawId: string, rawMonth: string): Lookup {
  const id = parseId(rawId);
  const item = id === undefined ? undefined : getRecurringItem(db, id);
  if (item === undefined) {
    return { ok: false, status: 404, error: MESSAGES.itemNotFound };
  }
  const month = isoMonth.safeParse(rawMonth);
  if (!month.success) {
    return {
      ok: false,
      status: 400,
      error: MESSAGES.invalidMonth,
      fields: { month: MESSAGES.invalidMonth },
    };
  }
  if (!isDueInMonth(item, month.data)) {
    return { ok: false, status: 400, error: MESSAGES.notDue };
  }
  return { ok: true, item, month: month.data };
}

/** The movement a pending entry becomes, with the expected values. */
function movementFor(entry: PendingEntryDto) {
  return {
    date: entry.date,
    kind: entry.kind,
    categoryId: entry.categoryId,
    concept: entry.concept,
    amountCents: entry.amountCents,
    notes: entry.notes,
    recurringItemId: entry.recurringItemId,
  };
}

export function registerRecurringApi(app: FastifyInstance, db: Db): void {
  // --- Recurring items (CRUD) ---

  app.get('/api/recurring-items', () => listRecurringItems(db));

  app.post('/api/recurring-items', (request, reply) => {
    const parsed = recurringItemCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(parsed.error));
    }
    const problem = categoryError(db, parsed.data.kind, parsed.data.categoryId);
    if (problem !== undefined) {
      return badRequest(reply, problem.error, { [problem.field]: problem.error });
    }
    const created = db
      .insert(recurringItems)
      .values({ ...parsed.data, endMonth: parsed.data.endMonth ?? null })
      .returning({ id: recurringItems.id })
      .get();
    return reply.code(201).send(getRecurringItem(db, created.id));
  });

  app.patch('/api/recurring-items/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const current = id === undefined ? undefined : getRecurringItem(db, id);
    if (id === undefined || current === undefined) {
      return notFound(reply, MESSAGES.itemNotFound);
    }
    const patch = recurringItemUpdateSchema.safeParse(request.body);
    if (!patch.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(patch.error));
    }
    // Merge and validate the whole item, so end >= start holds after any change.
    // Confirmed movements are real records and never change with the item (ADR-0005).
    const merged = recurringItemCreateSchema.safeParse({
      kind: current.kind,
      categoryId: current.categoryId,
      concept: current.concept,
      amountCents: current.amountCents,
      expectedDay: current.expectedDay,
      startMonth: current.startMonth,
      endMonth: current.endMonth,
      notes: current.notes,
      ...patch.data,
    });
    if (!merged.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(merged.error));
    }
    const problem = categoryError(db, merged.data.kind, merged.data.categoryId);
    if (problem !== undefined) {
      return badRequest(reply, problem.error, { [problem.field]: problem.error });
    }
    db.update(recurringItems)
      .set({
        ...merged.data,
        endMonth: merged.data.endMonth ?? null,
        notes: merged.data.notes ?? null,
      })
      .where(eq(recurringItems.id, id))
      .run();
    return getRecurringItem(db, id);
  });

  // Confirmed movements stay (their link becomes null); skips are removed with the item.
  app.delete('/api/recurring-items/:id', (request, reply) => {
    const id = parseId((request.params as { id: string }).id);
    const deleted =
      id === undefined
        ? []
        : db
            .delete(recurringItems)
            .where(eq(recurringItems.id, id))
            .returning({ id: recurringItems.id })
            .all();
    if (deleted.length === 0) {
      return notFound(reply, MESSAGES.itemNotFound);
    }
    return reply.code(204).send();
  });

  // --- A month's pending and skipped entries (computed on read) ---

  app.get('/api/months/:month/pending', (request, reply) => {
    const month = isoMonth.safeParse((request.params as { month: string }).month);
    if (!month.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    return dueEntries(db, month.data).pending;
  });

  // Skipped entries stay visible so a skip can be undone.
  app.get('/api/months/:month/skipped', (request, reply) => {
    const month = isoMonth.safeParse((request.params as { month: string }).month);
    if (!month.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    return dueEntries(db, month.data).skipped;
  });

  // --- Confirm, confirm all, skip, undo skip ---

  app.post('/api/recurring-items/:id/months/:month/confirm', (request, reply) => {
    const params = request.params as { id: string; month: string };
    const found = lookup(db, params.id, params.month);
    if (!found.ok) {
      return found.status === 404
        ? notFound(reply, found.error)
        : badRequest(reply, found.error, found.fields);
    }
    const { item, month } = found;

    // Optional body: amount, date, concept and notes may be overridden.
    const overrides = confirmOverridesSchema.safeParse(request.body ?? {});
    if (!overrides.success) {
      return badRequest(reply, MESSAGES.invalid, fieldErrors(overrides.error));
    }
    if (confirmedItemIds(db, month).has(item.id)) {
      return conflict(reply, MESSAGES.alreadyConfirmed);
    }
    if (skippedItemIds(db, month).has(item.id)) {
      return conflict(reply, MESSAGES.skippedBlocksConfirm);
    }

    const base = movementFor(toEntry(item, month));
    const date = overrides.data.date ?? base.date;
    if (monthOf(date) !== month) {
      const message = MESSAGES.dateOutsideMonth(month);
      return badRequest(reply, message, { date: message });
    }
    const created = db
      .insert(movements)
      .values({
        ...base,
        date,
        amountCents: overrides.data.amountCents ?? base.amountCents,
        concept: overrides.data.concept ?? base.concept,
        notes: overrides.data.notes === undefined ? base.notes : overrides.data.notes,
      })
      .returning({ id: movements.id })
      .get();
    return reply.code(201).send(getMovement(db, created.id));
  });

  app.post('/api/months/:month/confirm-all', (request, reply) => {
    const parsed = isoMonth.safeParse((request.params as { month: string }).month);
    if (!parsed.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    // Every pending entry, with its expected values; skipped ones are left alone.
    const confirmed = db.transaction((tx) =>
      dueEntries(db, parsed.data).pending.map(
        (entry) =>
          tx.insert(movements).values(movementFor(entry)).returning({ id: movements.id }).get().id,
      ),
    );
    const result: MovementDto[] = confirmed.flatMap((id) => {
      const movement = getMovement(db, id);
      return movement === undefined ? [] : [movement];
    });
    return reply.code(201).send(result);
  });

  app.post('/api/recurring-items/:id/months/:month/skip', (request, reply) => {
    const params = request.params as { id: string; month: string };
    const found = lookup(db, params.id, params.month);
    if (!found.ok) {
      return found.status === 404
        ? notFound(reply, found.error)
        : badRequest(reply, found.error, found.fields);
    }
    if (confirmedItemIds(db, found.month).has(found.item.id)) {
      return conflict(reply, MESSAGES.alreadyConfirmed);
    }
    if (skippedItemIds(db, found.month).has(found.item.id)) {
      return conflict(reply, MESSAGES.alreadySkipped);
    }
    db.insert(recurringSkips).values({ recurringItemId: found.item.id, month: found.month }).run();
    return reply.code(204).send();
  });

  app.delete('/api/recurring-items/:id/months/:month/skip', (request, reply) => {
    const params = request.params as { id: string; month: string };
    const id = parseId(params.id);
    const month = isoMonth.safeParse(params.month);
    if (!month.success) {
      return badRequest(reply, MESSAGES.invalidMonth, { month: MESSAGES.invalidMonth });
    }
    const removed =
      id === undefined
        ? []
        : db
            .delete(recurringSkips)
            .where(
              and(eq(recurringSkips.recurringItemId, id), eq(recurringSkips.month, month.data)),
            )
            .returning({ id: recurringSkips.id })
            .all();
    if (removed.length === 0) {
      return notFound(reply, MESSAGES.skipNotFound);
    }
    return reply.code(204).send();
  });
}
