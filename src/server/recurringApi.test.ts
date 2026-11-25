import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  CategoryDto,
  MonthSummaryDto,
  MovementDto,
  PendingEntryDto,
  RecurringItemDto,
} from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

// The seed (fictional) defines five fixed items, all from 2026-01 with no end month:
// Nómina (income 200000, day 1), Alquiler (expense 70000, day 2), Internet (3500, day 10),
// Electricidad (6500, day 12), Gimnasio (3000, day 15). In January 2026 the salary and the
// rent are already confirmed, so Internet, Electricidad and Gimnasio are pending.

let handle: DbHandle;
let app: FastifyInstance;

beforeEach(() => {
  handle = openDatabase(':memory:');
  seed(handle.db);
  app = buildApp({ db: handle.db });
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const get = (url: string) => app.inject({ method: 'GET', url });
const post = (url: string, payload?: unknown) =>
  app.inject({
    method: 'POST',
    url,
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
const patch = (url: string, payload: unknown) =>
  app.inject({ method: 'PATCH', url, payload: payload as object });
const del = (url: string) => app.inject({ method: 'DELETE', url });

async function categoryId(name: string): Promise<number> {
  const all = (await get('/api/categories')).json<CategoryDto[]>();
  const found = all.find((c) => c.name === name);
  if (found === undefined) {
    throw new Error(`seed category ${name} missing`);
  }
  return found.id;
}

async function itemId(concept: string): Promise<number> {
  const all = (await get('/api/recurring-items')).json<RecurringItemDto[]>();
  const found = all.find((i) => i.concept === concept);
  if (found === undefined) {
    throw new Error(`seed item ${concept} missing`);
  }
  return found.id;
}

const pending = async (month: string) =>
  (await get(`/api/months/${month}/pending`)).json<PendingEntryDto[]>();
const skipped = async (month: string) =>
  (await get(`/api/months/${month}/skipped`)).json<PendingEntryDto[]>();
const concepts = (entries: PendingEntryDto[]) => entries.map((e) => e.concept);
const movementsOf = async (month: string) =>
  (await get(`/api/movements?month=${month}`)).json<MovementDto[]>();
const summary = async (month: string) =>
  (await get(`/api/months/${month}/summary`)).json<MonthSummaryDto>();
const confirmUrl = (id: number, month: string) =>
  `/api/recurring-items/${String(id)}/months/${month}/confirm`;
const skipUrl = (id: number, month: string) =>
  `/api/recurring-items/${String(id)}/months/${month}/skip`;

async function newItem(over: Record<string, unknown> = {}) {
  const response = await post('/api/recurring-items', {
    kind: 'expense',
    categoryId: await categoryId('Ocio'),
    concept: 'Suscripción',
    amountCents: 999,
    expectedDay: 20,
    startMonth: '2026-03',
    ...over,
  });
  return response;
}

describe('recurring items: list and create', () => {
  it('lists the seeded items ordered by expected day, with category names', async () => {
    const response = await get('/api/recurring-items');
    const items = response.json<RecurringItemDto[]>();
    expect(response.statusCode).toBe(200);
    expect(items.map((i) => [i.concept, i.expectedDay])).toEqual([
      ['Nómina', 1],
      ['Alquiler', 2],
      ['Internet', 10],
      ['Electricidad', 12],
      ['Gimnasio', 15],
    ]);
    expect(items[0]).toMatchObject({
      kind: 'income',
      categoryName: 'Nómina ficticia',
      amountCents: 200_000,
      startMonth: '2026-01',
      endMonth: null,
      notes: null,
    });
  });

  it('creates an item and returns it with 201', async () => {
    const response = await newItem({ notes: 'Plan anual', endMonth: '2026-12' });
    expect(response.statusCode).toBe(201);
    expect(response.json<RecurringItemDto>()).toMatchObject({
      kind: 'expense',
      categoryName: 'Ocio',
      concept: 'Suscripción',
      amountCents: 999,
      expectedDay: 20,
      startMonth: '2026-03',
      endMonth: '2026-12',
      notes: 'Plan anual',
    });
    expect((await get('/api/recurring-items')).json<RecurringItemDto[]>()).toHaveLength(6);
  });

  it.each([
    ['day 0', { expectedDay: 0 }, 'expectedDay'],
    ['day 32', { expectedDay: 32 }, 'expectedDay'],
    ['fractional day', { expectedDay: 1.5 }, 'expectedDay'],
    ['zero amount', { amountCents: 0 }, 'amountCents'],
    ['fractional amount', { amountCents: 12.5 }, 'amountCents'],
    ['amount as text', { amountCents: '12,50' }, 'amountCents'],
    ['bad start month', { startMonth: '2026-13' }, 'startMonth'],
    ['end before start', { endMonth: '2026-02' }, 'endMonth'],
    ['blank concept', { concept: ' ' }, 'concept'],
    ['unknown kind', { kind: 'transfer' }, 'kind'],
    ['unknown field', { surprise: true }, '_'],
  ])('returns 400 naming the field for %s', async (_name, change, field) => {
    const response = await newItem(change);
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string; fields: Record<string, string> }>();
    expect(body.error).toBe('Datos no válidos.');
    expect(body.fields).toHaveProperty(field);
    // Messages are in Spanish, not Zod's English defaults.
    expect(Object.values(body.fields).join(' ')).not.toMatch(/Expected|Invalid/);
  });

  it("returns 400, not 500, when the kind does not match the category's kind", async () => {
    const response = await newItem({ kind: 'income' }); // 'Ocio' is an expense category
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty('kind');
  });

  it('returns 400 for an unknown category', async () => {
    const response = await newItem({ categoryId: 9999 });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty('categoryId');
  });
});

describe('recurring items: update and delete', () => {
  it('updates only the given fields', async () => {
    const id = await itemId('Gimnasio');
    const response = await patch(`/api/recurring-items/${String(id)}`, {
      amountCents: 3_500,
      expectedDay: 20,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<RecurringItemDto>()).toMatchObject({
      concept: 'Gimnasio',
      amountCents: 3_500,
      expectedDay: 20,
      startMonth: '2026-01',
    });
  });

  it('ends an item by setting an end month, and can clear it again with null', async () => {
    const id = await itemId('Gimnasio');
    const url = `/api/recurring-items/${String(id)}`;
    expect((await patch(url, { endMonth: '2026-03' })).json<RecurringItemDto>().endMonth).toBe(
      '2026-03',
    );
    expect(await pending('2026-04')).not.toContainEqual(
      expect.objectContaining({ concept: 'Gimnasio' }),
    );
    expect((await patch(url, { endMonth: null })).json<RecurringItemDto>().endMonth).toBeNull();
    expect(concepts(await pending('2026-04'))).toContain('Gimnasio');
  });

  it('rejects an end month before the start month, also when only the start moves', async () => {
    const id = await itemId('Gimnasio');
    const url = `/api/recurring-items/${String(id)}`;
    expect((await patch(url, { endMonth: '2025-12' })).statusCode).toBe(400);
    await patch(url, { endMonth: '2026-03' });
    const late = await patch(url, { startMonth: '2026-06' });
    expect(late.statusCode).toBe(400);
    expect(late.json<{ fields: Record<string, string> }>().fields).toHaveProperty('endMonth');
  });

  it('rejects a kind change that no longer matches the category', async () => {
    const id = await itemId('Gimnasio');
    expect((await patch(`/api/recurring-items/${String(id)}`, { kind: 'income' })).statusCode).toBe(
      400,
    );
  });

  it('changing an item does not change movements already confirmed', async () => {
    const id = await itemId('Internet');
    await post(confirmUrl(id, '2026-01'));
    await patch(`/api/recurring-items/${String(id)}`, { amountCents: 9_900, concept: 'Fibra' });

    const confirmed = (await movementsOf('2026-01')).find((m) => m.recurringItemId === id);
    expect(confirmed).toMatchObject({ concept: 'Internet', amountCents: 3_500 });
    // The next month uses the new values.
    const next = (await pending('2026-02')).find((e) => e.recurringItemId === id);
    expect(next).toMatchObject({ concept: 'Fibra', amountCents: 9_900 });
  });

  it.each(['9999', 'abc', '0', '-1'])('returns 404 for the unknown id %s', async (id) => {
    const response = await patch(`/api/recurring-items/${id}`, { amountCents: 1 });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toMatch(/No se ha encontrado/);
    expect((await del(`/api/recurring-items/${id}`)).statusCode).toBe(404);
  });

  it('deleting an item keeps its confirmed movements, unlinked, and removes its skips', async () => {
    const internet = await itemId('Internet');
    const gym = await itemId('Gimnasio');
    await post(confirmUrl(internet, '2026-01'));
    await post(skipUrl(gym, '2026-01'));

    expect((await del(`/api/recurring-items/${String(internet)}`)).statusCode).toBe(204);
    expect((await del(`/api/recurring-items/${String(gym)}`)).statusCode).toBe(204);

    const kept = (await movementsOf('2026-01')).find((m) => m.concept === 'Internet');
    expect(kept).toMatchObject({ amountCents: 3_500, recurringItemId: null });
    expect((await get('/api/recurring-items')).json<RecurringItemDto[]>()).toHaveLength(3);
    expect(await skipped('2026-01')).toEqual([]);
  });
});

describe('pending entries (computed, not stored)', () => {
  it('lists the items due in a month that are neither confirmed nor skipped, by date', async () => {
    const entries = await pending('2026-01');
    expect(entries.map((e) => [e.concept, e.date, e.amountCents])).toEqual([
      ['Internet', '2026-01-10', 3_500],
      ['Electricidad', '2026-01-12', 6_500],
      ['Gimnasio', '2026-01-15', 3_000],
    ]);
    expect(entries[0]).toMatchObject({
      month: '2026-01',
      kind: 'expense',
      categoryName: 'Suministros',
      notes: null,
    });
  });

  it('shows nothing before the start month of any item', async () => {
    expect(await pending('2025-12')).toEqual([]);
  });

  it('keeps showing unconfirmed items in past months and in future months', async () => {
    expect(await pending('2026-02')).toHaveLength(5);
    expect(await pending('2031-08')).toHaveLength(5);
  });

  it('respects start and end months, both included', async () => {
    await newItem({ concept: 'Curso', startMonth: '2027-03', endMonth: '2027-05' });
    const has = async (month: string) => concepts(await pending(month)).includes('Curso');
    expect(await has('2027-02')).toBe(false);
    expect(await has('2027-03')).toBe(true);
    expect(await has('2027-04')).toBe(true);
    expect(await has('2027-05')).toBe(true);
    expect(await has('2027-06')).toBe(false);
  });

  it('clamps day 31 to the month length, including leap years', async () => {
    await newItem({ concept: 'Fin de mes', expectedDay: 31, startMonth: '2026-01' });
    const dateIn = async (month: string) =>
      (await pending(month)).find((e) => e.concept === 'Fin de mes')?.date;
    expect(await dateIn('2026-01')).toBe('2026-01-31');
    expect(await dateIn('2026-02')).toBe('2026-02-28');
    expect(await dateIn('2028-02')).toBe('2028-02-29');
    expect(await dateIn('2026-04')).toBe('2026-04-30');
  });

  it('returns 400 for a malformed month on pending and skipped', async () => {
    for (const path of ['pending', 'skipped']) {
      const response = await get(`/api/months/2026-1/${path}`);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toMatch(/AAAA-MM/);
    }
  });
});

describe('confirm one', () => {
  it('creates a linked movement with the expected values and removes the entry from pending', async () => {
    const id = await itemId('Electricidad');
    const response = await post(confirmUrl(id, '2026-01'));
    expect(response.statusCode).toBe(201);
    expect(response.json<MovementDto>()).toMatchObject({
      date: '2026-01-12',
      kind: 'expense',
      categoryName: 'Suministros',
      concept: 'Electricidad',
      amountCents: 6_500,
      notes: null,
      recurringItemId: id,
    });
    expect(concepts(await pending('2026-01'))).toEqual(['Internet', 'Gimnasio']);
    expect((await movementsOf('2026-01')).filter((m) => m.recurringItemId === id)).toHaveLength(1);
  });

  it('lets the amount, date, concept and notes be overridden', async () => {
    const id = await itemId('Electricidad');
    const response = await post(confirmUrl(id, '2026-01'), {
      amountCents: 7_123,
      date: '2026-01-20',
      concept: 'Electricidad de diciembre',
      notes: 'Más consumo',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<MovementDto>()).toMatchObject({
      date: '2026-01-20',
      concept: 'Electricidad de diciembre',
      amountCents: 7_123,
      notes: 'Más consumo',
      recurringItemId: id,
    });
    // The item itself is unchanged.
    expect(
      (await get('/api/recurring-items')).json<RecurringItemDto[]>().find((i) => i.id === id),
    ).toMatchObject({
      concept: 'Electricidad',
      amountCents: 6_500,
    });
  });

  it("uses the item's notes by default, and null clears them", async () => {
    const id = (
      await newItem({ notes: 'Del contrato', startMonth: '2026-01' })
    ).json<RecurringItemDto>().id;
    const kept = await post(confirmUrl(id, '2026-01'));
    expect(kept.json<MovementDto>().notes).toBe('Del contrato');
    await del(`/api/movements/${String(kept.json<MovementDto>().id)}`);
    // The trashed confirmation holds the slot until it is deleted for good.
    await del(`/api/trash/movements/${String(kept.json<MovementDto>().id)}`);
    const cleared = await post(confirmUrl(id, '2026-01'), { notes: null });
    expect(cleared.json<MovementDto>().notes).toBeNull();
  });

  it('returns 409 when confirmed twice, and keeps a single movement', async () => {
    const id = await itemId('Internet');
    expect((await post(confirmUrl(id, '2026-01'))).statusCode).toBe(201);
    const again = await post(confirmUrl(id, '2026-01'));
    expect(again.statusCode).toBe(409);
    expect(again.json<{ error: string }>().error).toMatch(/ya está confirmado/);
    expect((await movementsOf('2026-01')).filter((m) => m.recurringItemId === id)).toHaveLength(1);
  });

  it('can be confirmed once in each month', async () => {
    const id = await itemId('Internet');
    expect((await post(confirmUrl(id, '2026-01'))).statusCode).toBe(201);
    expect((await post(confirmUrl(id, '2026-02'))).statusCode).toBe(201);
    expect(concepts(await pending('2026-02'))).not.toContain('Internet');
    expect(concepts(await pending('2026-03'))).toContain('Internet');
  });

  it('returns 400 when the date is outside the month, naming the field', async () => {
    const id = await itemId('Internet');
    const response = await post(confirmUrl(id, '2026-01'), { date: '2026-02-01' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields.date).toMatch(/2026-01/);
    expect(await movementsOf('2026-02')).toEqual([]);
  });

  it.each([
    ['zero amount', { amountCents: 0 }],
    ['fractional amount', { amountCents: 1.5 }],
    ['impossible date', { date: '2026-01-32' }],
    ['blank concept', { concept: ' ' }],
    ['kind override', { kind: 'income' }],
    ['category override', { categoryId: 3 }],
  ])('returns 400 for %s', async (_name, body) => {
    const id = await itemId('Internet');
    expect((await post(confirmUrl(id, '2026-01'), body)).statusCode).toBe(400);
    expect(concepts(await pending('2026-01'))).toContain('Internet');
  });

  it('returns 400 for a month where the item is not due, 404 for unknown ids', async () => {
    const id = await itemId('Internet');
    const before = await post(confirmUrl(id, '2025-12'));
    expect(before.statusCode).toBe(400);
    expect(before.json<{ error: string }>().error).toMatch(/no corresponde/);
    expect((await post(confirmUrl(9999, '2026-01'))).statusCode).toBe(404);
    expect((await post('/api/recurring-items/abc/months/2026-01/confirm')).statusCode).toBe(404);
    expect((await post(confirmUrl(id, '2026-1'))).statusCode).toBe(400);
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"hola"'],
    ['a number', '5'],
    ['an unknown field', '{"surprise":true}'],
    ['a wrong type', '{"amountCents":"12"}'],
    ['malformed JSON', '{"amountCents":'],
  ])('answers 400, never 500, when the body is %s', async (_name, payload) => {
    const id = await itemId('Internet');
    const response = await app.inject({
      method: 'POST',
      url: confirmUrl(id, '2026-01'),
      headers: { 'content-type': 'application/json' },
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(concepts(await pending('2026-01'))).toContain('Internet');
    expect((await movementsOf('2026-01')).filter((m) => m.recurringItemId === id)).toEqual([]);
  });

  it('treats a missing body, an empty object and null as "no overrides"', async () => {
    const [internet, power, gym] = await Promise.all([
      itemId('Internet'),
      itemId('Electricidad'),
      itemId('Gimnasio'),
    ]);
    const none = await post(confirmUrl(internet, '2026-01'));
    const empty = await post(confirmUrl(power, '2026-01'), {});
    const nullBody = await app.inject({
      method: 'POST',
      url: confirmUrl(gym, '2026-01'),
      headers: { 'content-type': 'application/json' },
      payload: 'null',
    });
    for (const response of [none, empty, nullBody]) {
      expect(response.statusCode).toBe(201);
    }
    expect(concepts(await pending('2026-01'))).toEqual([]);
  });

  it('refuses to confirm a skipped entry until the skip is undone', async () => {
    const id = await itemId('Internet');
    await post(skipUrl(id, '2026-01'));
    expect((await post(confirmUrl(id, '2026-01'))).statusCode).toBe(409);
    await del(skipUrl(id, '2026-01'));
    expect((await post(confirmUrl(id, '2026-01'))).statusCode).toBe(201);
  });

  it('makes the item pending again when its confirmed movement is deleted', async () => {
    const id = await itemId('Internet');
    const movement = (await post(confirmUrl(id, '2026-01'))).json<MovementDto>();
    expect(concepts(await pending('2026-01'))).not.toContain('Internet');

    expect((await del(`/api/movements/${String(movement.id)}`)).statusCode).toBe(204);
    expect(concepts(await pending('2026-01'))).toContain('Internet');
    // Confirming again is refused while the movement is in the trash (it holds the slot)...
    expect((await post(confirmUrl(id, '2026-01'))).statusCode).toBe(409);
    // ...and works once it is deleted for good.
    expect((await del(`/api/trash/movements/${String(movement.id)}`)).statusCode).toBe(204);
    expect((await post(confirmUrl(id, '2026-01'))).statusCode).toBe(201);
  });
});

describe('a confirmed movement keeps its month', () => {
  it('can change day inside the month, but not move to another month (400)', async () => {
    const id = await itemId('Internet');
    const movement = (await post(confirmUrl(id, '2026-01'))).json<MovementDto>();
    const url = `/api/movements/${String(movement.id)}`;

    expect((await patch(url, { date: '2026-01-28', amountCents: 4_000 })).statusCode).toBe(200);
    const moved = await patch(url, { date: '2026-02-01' });
    expect(moved.statusCode).toBe(400);
    expect(moved.json<{ fields: Record<string, string> }>().fields).toHaveProperty('date');
    // Free movements can still move between months.
    const free = (await movementsOf('2026-01')).find((m) => m.recurringItemId === null);
    expect(free).toBeDefined();
    expect(
      (await patch(`/api/movements/${String(free?.id)}`, { date: '2026-02-01' })).statusCode,
    ).toBe(200);
  });

  it('cannot be linked through the movements endpoint', async () => {
    const response = await post('/api/movements', {
      date: '2026-01-10',
      kind: 'expense',
      categoryId: await categoryId('Suministros'),
      concept: 'Internet',
      amountCents: 3_500,
      recurringItemId: 1,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('confirm all', () => {
  it('confirms every pending entry with its expected values', async () => {
    const response = await post('/api/months/2026-01/confirm-all');
    expect(response.statusCode).toBe(201);
    const created = response.json<MovementDto[]>();
    expect(created.map((m) => [m.concept, m.date, m.amountCents])).toEqual([
      ['Internet', '2026-01-10', 3_500],
      ['Electricidad', '2026-01-12', 6_500],
      ['Gimnasio', '2026-01-15', 3_000],
    ]);
    expect(created.every((m) => m.recurringItemId !== null)).toBe(true);
    expect(await pending('2026-01')).toEqual([]);
    expect(await movementsOf('2026-01')).toHaveLength(6 + 3);
  });

  it('is safe to repeat: nothing pending means nothing created, no duplicates', async () => {
    await post('/api/months/2026-01/confirm-all');
    const again = await post('/api/months/2026-01/confirm-all');
    expect(again.statusCode).toBe(201);
    expect(again.json<MovementDto[]>()).toEqual([]);
    expect(await movementsOf('2026-01')).toHaveLength(9);
  });

  it('leaves skipped entries alone and other months untouched', async () => {
    await post(skipUrl(await itemId('Gimnasio'), '2026-01'));
    const created = (await post('/api/months/2026-01/confirm-all')).json<MovementDto[]>();
    expect(created.map((m) => m.concept)).toEqual(['Internet', 'Electricidad']);
    expect(concepts(await skipped('2026-01'))).toEqual(['Gimnasio']);
    expect(await movementsOf('2026-02')).toEqual([]);
    expect(await pending('2026-02')).toHaveLength(5);
  });

  it('returns 400 for a malformed month', async () => {
    expect((await post('/api/months/2026-1/confirm-all')).statusCode).toBe(400);
  });
});

describe('skip and undo skip', () => {
  it('skips one item for one month only, and the skipped entry can be listed', async () => {
    const id = await itemId('Gimnasio');
    expect((await post(skipUrl(id, '2026-01'))).statusCode).toBe(204);
    expect(concepts(await pending('2026-01'))).toEqual(['Internet', 'Electricidad']);
    expect(concepts(await skipped('2026-01'))).toEqual(['Gimnasio']);
    expect(concepts(await pending('2026-02'))).toContain('Gimnasio');
  });

  it('undoes a skip, and returns 404 when there is nothing to undo', async () => {
    const id = await itemId('Gimnasio');
    await post(skipUrl(id, '2026-01'));
    expect((await del(skipUrl(id, '2026-01'))).statusCode).toBe(204);
    expect(concepts(await pending('2026-01'))).toContain('Gimnasio');
    expect(await skipped('2026-01')).toEqual([]);

    const again = await del(skipUrl(id, '2026-01'));
    expect(again.statusCode).toBe(404);
    expect((await del(skipUrl(id, '2026-02'))).statusCode).toBe(404);
  });

  it('returns 409 when skipping twice or an already confirmed entry', async () => {
    const gym = await itemId('Gimnasio');
    await post(skipUrl(gym, '2026-01'));
    const twice = await post(skipUrl(gym, '2026-01'));
    expect(twice.statusCode).toBe(409);
    expect(twice.json<{ error: string }>().error).toMatch(/ya está saltado/);

    const internet = await itemId('Internet');
    await post(confirmUrl(internet, '2026-01'));
    expect((await post(skipUrl(internet, '2026-01'))).statusCode).toBe(409);
  });

  it('returns 400 for a month where the item is not due, 404 for unknown ids', async () => {
    const id = await itemId('Gimnasio');
    expect((await post(skipUrl(id, '2025-12'))).statusCode).toBe(400);
    expect((await post(skipUrl(9999, '2026-01'))).statusCode).toBe(404);
    expect((await post(skipUrl(id, '2026-1'))).statusCode).toBe(400);
    expect((await del(skipUrl(id, '2026-1'))).statusCode).toBe(400);
  });
});

describe('summary with pending items', () => {
  it('counts only confirmed movements in the totals, and reports pending apart', async () => {
    const before = await summary('2026-02');
    expect(before).toMatchObject({
      incomeCents: 0,
      expenseCents: 0,
      savingsCents: 0,
      pendingIncomeCents: 200_000,
      pendingExpenseCents: 70_000 + 3_500 + 6_500 + 3_000,
      projectedSavingsCents: 200_000 - 83_000,
    });
  });

  it('moves an item from pending to confirmed, with a changed amount', async () => {
    // Confirm the electricity bill in January for more than expected (65,00 → 71,23).
    await post(confirmUrl(await itemId('Electricidad'), '2026-01'), { amountCents: 7_123 });
    expect(await summary('2026-01')).toEqual({
      month: '2026-01',
      incomeCents: 200_000,
      expenseCents: 90_070 + 7_123,
      repaymentCents: 10_000,
      savingsCents: 200_000 - 97_193 - 10_000,
      pendingIncomeCents: 0,
      pendingExpenseCents: 3_500 + 3_000,
      pendingRepaymentCents: 0,
      // confirmed savings (92 807) + pending income (0) − pending expenses (6 500)
      projectedSavingsCents: 200_000 - 97_193 - 10_000 - 6_500,
    });
  });

  it('does not count skipped items as pending, and confirm all empties the pending part', async () => {
    await post(skipUrl(await itemId('Gimnasio'), '2026-01'));
    expect((await summary('2026-01')).pendingExpenseCents).toBe(3_500 + 6_500);

    await post('/api/months/2026-01/confirm-all');
    const done = await summary('2026-01');
    expect(done.pendingExpenseCents).toBe(0);
    expect(done.pendingIncomeCents).toBe(0);
    expect(done.projectedSavingsCents).toBe(done.savingsCents);
  });

  it('subtracts pending repayments (a fixed loan installment) from the projected savings', async () => {
    await newItem({
      kind: 'repayment',
      categoryId: await categoryId('Amortización extra'),
      concept: 'Cuota del préstamo',
      amountCents: 15_000,
      expectedDay: 5,
      startMonth: '2026-01',
    });
    const s = await summary('2026-01');
    expect(s.pendingRepaymentCents).toBe(15_000);
    expect(s.projectedSavingsCents).toBe(s.savingsCents - 13_000 - 15_000);
  });

  it('follows a deleted confirmed movement (pending comes back)', async () => {
    const movement = (
      await post(confirmUrl(await itemId('Internet'), '2026-01'))
    ).json<MovementDto>();
    expect((await summary('2026-01')).pendingExpenseCents).toBe(9_500);
    await del(`/api/movements/${String(movement.id)}`);
    expect((await summary('2026-01')).pendingExpenseCents).toBe(13_000);
  });
});
