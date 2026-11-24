import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto, GoalDto, SettingsDto, YearSummaryDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { appSettings } from './db/schema.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

let handle: DbHandle;
let app: FastifyInstance;

// Seed: January 2026 has income 2.000,00, expenses 900,70 and repayments 100,00 (savings 999,30)
// and one goal, "Fondo de emergencia", 6.000,00 by 2026-12-31. No settings.
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
const send = (method: 'POST' | 'PATCH' | 'PUT', url: string, payload: unknown) =>
  app.inject({ method, url, payload: payload as object });
const year = async (y: string) => (await get(`/api/years/${y}/summary`)).json<YearSummaryDto>();
const goals = async (today: string) => (await get(`/api/goals?today=${today}`)).json<GoalDto[]>();

describe('settings', () => {
  it('start empty: zero and no date', async () => {
    const response = await get('/api/settings');
    expect(response.statusCode).toBe(200);
    expect(response.json<SettingsDto>()).toEqual({
      initialSavingsCents: 0,
      initialSavingsDate: null,
    });
  });

  it('save the initial balance and its date, and replace them on the next save', async () => {
    const first = await send('PUT', '/api/settings', {
      initialSavingsCents: 250_000,
      initialSavingsDate: '2025-12-31',
    });
    expect(first.statusCode).toBe(200);
    expect(first.json<SettingsDto>()).toEqual({
      initialSavingsCents: 250_000,
      initialSavingsDate: '2025-12-31',
    });
    await send('PUT', '/api/settings', {
      initialSavingsCents: 0,
      initialSavingsDate: '2026-01-01',
    });
    expect((await get('/api/settings')).json<SettingsDto>()).toEqual({
      initialSavingsCents: 0,
      initialSavingsDate: '2026-01-01',
    });
    // Always the single row.
    expect(handle.db.select().from(appSettings).all()).toHaveLength(1);
  });

  it.each([
    ['negative balance', { initialSavingsCents: -1 }, 'initialSavingsCents'],
    ['float balance', { initialSavingsCents: 10.5 }, 'initialSavingsCents'],
    ['string balance', { initialSavingsCents: '100' }, 'initialSavingsCents'],
    ['impossible date', { initialSavingsDate: '2026-02-30' }, 'initialSavingsDate'],
    ['missing date', { initialSavingsDate: undefined }, 'initialSavingsDate'],
  ])('rejects %s with 400', async (_label, override, field) => {
    const body = { initialSavingsCents: 1_000, initialSavingsDate: '2026-01-01', ...override };
    const response = await send('PUT', '/api/settings', body);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty(field);
    expect((await get('/api/settings')).json<SettingsDto>().initialSavingsDate).toBeNull();
  });
});

describe('GET /api/years/:year/summary', () => {
  it('has a row per month with income, expenses, repayments and savings', async () => {
    const summary = await year('2026');
    expect(summary.rows).toHaveLength(12);
    expect(summary.rows[0]).toMatchObject({
      month: '2026-01',
      incomeCents: 200_000,
      expenseCents: 90_070,
      repaymentCents: 10_000,
      savingsCents: 99_930,
    });
    expect(summary.rows[1]).toMatchObject({ month: '2026-02', incomeCents: 0, savingsCents: 0 });
    expect(summary.totals).toEqual({
      incomeCents: 200_000,
      expenseCents: 90_070,
      repaymentCents: 10_000,
      savingsCents: 99_930,
    });
  });

  it('accumulates from the first movement when no initial balance is set', async () => {
    const summary = await year('2026');
    expect(summary.rows[0]?.accumulatedCents).toBe(99_930);
    expect(summary.rows[11]?.accumulatedCents).toBe(99_930);
  });

  it('accumulates from the initial balance and its date once set', async () => {
    await send('PUT', '/api/settings', {
      initialSavingsCents: 500_000,
      initialSavingsDate: '2026-01-10',
    });
    const summary = await year('2026');
    // After 10 January: the 10th itself (Compra semanal, 85,50) is already in the balance.
    // Later: expenses 91,20 + 24,00 + 700,00 (Alquiler was on the 2nd: before, so not counted)
    // and the 100,00 repayment; the salary (1st) is before as well.
    expect(summary.rows[0]?.accumulatedCents).toBe(500_000 - 9_120 - 2_400 - 10_000);
    expect(summary.rows[0]?.savingsCents).toBe(99_930); // the month's own savings are unchanged
  });

  it('has no accumulated value before the initial date, and carries it into later years', async () => {
    await send('PUT', '/api/settings', {
      initialSavingsCents: 100_000,
      initialSavingsDate: '2026-03-15',
    });
    const y2026 = await year('2026');
    expect(y2026.rows.slice(0, 2).map((r) => r.accumulatedCents)).toEqual([null, null]);
    expect(y2026.rows[2]?.accumulatedCents).toBe(100_000);
    expect((await year('2027')).rows[0]?.accumulatedCents).toBe(100_000);
  });

  it('follows new movements', async () => {
    const categories = (await get('/api/categories')).json<CategoryDto[]>();
    const salary = categories.find((c) => c.kind === 'income');
    await send('POST', '/api/movements', {
      date: '2026-03-05',
      kind: 'income',
      categoryId: salary?.id,
      concept: 'Extra',
      amountCents: 12_345,
    });
    const summary = await year('2026');
    expect(summary.rows[2]).toMatchObject({
      incomeCents: 12_345,
      accumulatedCents: 99_930 + 12_345,
    });
  });

  it.each(['26', 'abcd', '20260', '2026-01'])(
    'returns 400 for the malformed year %j',
    async (y) => {
      expect((await get(`/api/years/${y}/summary`)).statusCode).toBe(400);
    },
  );
});

describe('goals', () => {
  it('lists the goal with its progress against the accumulated savings', async () => {
    const [goal] = await goals('2026-10-15');
    expect(goal).toMatchObject({
      name: 'Fondo de emergencia',
      targetAmountCents: 600_000,
      accumulatedCents: 99_930,
      progressPercent: 16,
      remainingCents: 500_070,
      status: 'open',
      monthsLeft: 3,
      monthlyRequiredCents: 166_690, // 500.070 / 3 = 166.690 exactly
    });
  });

  it('uses the initial balance once set, and only movements up to today', async () => {
    await send('PUT', '/api/settings', {
      initialSavingsCents: 400_000,
      initialSavingsDate: '2026-02-01',
    });
    expect((await goals('2026-02-15'))[0]).toMatchObject({
      accumulatedCents: 400_000,
      remainingCents: 200_000,
    });
    // Before the January movements' date: they are not counted yet (no date set → from the start).
    await send('PUT', '/api/settings', {
      initialSavingsCents: 0,
      initialSavingsDate: '2025-12-31',
    });
    expect((await goals('2026-01-02'))[0]?.accumulatedCents).toBe(200_000 - 70_000); // salary and rent
  });

  it('is overdue after its date, with no monthly figure', async () => {
    expect((await goals('2027-01-15'))[0]).toMatchObject({
      status: 'overdue',
      monthlyRequiredCents: null,
    });
  });

  it('adds a goal (201), and edits it', async () => {
    const created = await send('POST', '/api/goals', {
      name: ' Viaje ',
      targetAmountCents: 150_000,
      targetDate: '2027-06-30',
    });
    expect(created.statusCode).toBe(201);
    const goal = created.json<GoalDto>();
    expect(goal).toMatchObject({
      name: 'Viaje',
      targetAmountCents: 150_000,
      targetDate: '2027-06-30',
    });

    const edited = await send('PATCH', `/api/goals/${String(goal.id)}`, {
      name: 'Viaje a Japón',
      targetAmountCents: 200_000,
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json<GoalDto>()).toMatchObject({
      name: 'Viaje a Japón',
      targetAmountCents: 200_000,
      targetDate: '2027-06-30',
    });
  });

  it('orders goals by target date', async () => {
    await send('POST', '/api/goals', {
      name: 'Antes',
      targetAmountCents: 1_000,
      targetDate: '2026-03-01',
    });
    expect((await goals('2026-01-01')).map((g) => g.name)).toEqual([
      'Antes',
      'Fondo de emergencia',
    ]);
  });

  it.each([
    ['blank name', { name: ' ' }, 'name'],
    ['zero target', { targetAmountCents: 0 }, 'targetAmountCents'],
    ['float target', { targetAmountCents: 1.5 }, 'targetAmountCents'],
    ['bad date', { targetDate: '2026-13-01' }, 'targetDate'],
  ])('rejects %s with 400, on create and on edit', async (_label, override, field) => {
    const body = { name: 'X', targetAmountCents: 1_000, targetDate: '2027-01-01', ...override };
    const create = await send('POST', '/api/goals', body);
    expect(create.statusCode).toBe(400);
    expect(create.json<{ fields: Record<string, string> }>().fields).toHaveProperty(field);
    const id = (await goals('2026-01-01'))[0]?.id ?? 0;
    expect((await send('PATCH', `/api/goals/${String(id)}`, override)).statusCode).toBe(400);
  });

  it('404s for an unknown or malformed goal id, and 400s for a bad today', async () => {
    expect((await send('PATCH', '/api/goals/9999', { name: 'X' })).statusCode).toBe(404);
    expect((await send('PATCH', '/api/goals/abc', { name: 'X' })).statusCode).toBe(404);
    expect((await get('/api/goals?today=ayer')).statusCode).toBe(400);
  });
});
