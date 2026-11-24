import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto, ProjectionDto, RecurringItemDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';

// Task 0013, block 4: the base projection from real data. Invented figures, in cents.

let handle: DbHandle;
let app: FastifyInstance;
let pay: number;
let housing: number;
let leisure: number;
let rentItem: number;
let salaryItem: number;

const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });

const projection = async (query: string) => {
  const response = await call('GET', `/api/projection${query}`);
  expect(response.statusCode, response.body).toBe(200);
  return response.json<ProjectionDto>();
};

async function category(name: string, kind: CategoryDto['kind']): Promise<number> {
  return (await call('POST', '/api/categories', { name, kind })).json<CategoryDto>().id;
}

beforeEach(async () => {
  handle = openDatabase(':memory:');
  app = buildApp({ db: handle.db });
  pay = await category('Nómina', 'income');
  housing = await category('Vivienda', 'expense');
  leisure = await category('Ocio', 'expense');

  // 1.000,00 saved on 2026-01-01; October 2026 added 1.300,00 (2.000 − 700).
  await call('PUT', '/api/settings', {
    initialSavingsCents: 100_000,
    initialSavingsDate: '2026-01-01',
  });
  const move = (date: string, kind: string, categoryId: number, amountCents: number) =>
    call('POST', '/api/movements', {
      date,
      kind,
      categoryId,
      concept: 'Dato de ejemplo',
      amountCents,
    });
  await move('2026-10-05', 'income', pay, 200_000);
  await move('2026-10-06', 'expense', housing, 70_000);

  const item = async (data: Record<string, unknown>) =>
    (await call('POST', '/api/recurring-items', data)).json<RecurringItemDto>().id;
  salaryItem = await item({
    kind: 'income',
    categoryId: pay,
    concept: 'Nómina',
    amountCents: 200_000,
    expectedDay: 1,
    startMonth: '2026-01',
  });
  rentItem = await item({
    kind: 'expense',
    categoryId: housing,
    concept: 'Alquiler',
    amountCents: 70_000,
    expectedDay: 2,
    startMonth: '2026-01',
    endMonth: '2027-01',
  });
  await call('POST', '/api/budget-lines', {
    categoryId: leisure,
    amountCents: 10_000,
    validFrom: '2026-01',
  });
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const table = (p: ProjectionDto) =>
  p.months.map((m) => [m.month, m.incomeCents, m.expenseCents, m.savingsCents, m.accumulatedCents]);

describe('GET /api/projection', () => {
  it('starts from the savings at the end of last month and projects fixed items and budgets', async () => {
    const result = await projection('?today=2026-11-15&to=2027-02');
    expect(result).toMatchObject({
      currentMonth: '2026-11',
      endMonth: '2027-02',
      baselineCents: 230_000,
    });
    // Rent ends in January 2027 (included): February only has the Ocio budget.
    expect(table(result)).toEqual([
      ['2026-11', 200_000, 80_000, 120_000, 350_000],
      ['2026-12', 200_000, 80_000, 120_000, 470_000],
      ['2027-01', 200_000, 80_000, 120_000, 590_000],
      ['2027-02', 200_000, 10_000, 190_000, 780_000],
    ]);
  });

  it('in the current month counts what is confirmed, adds what is pending and fills the budget', async () => {
    await call('POST', `/api/recurring-items/${String(salaryItem)}/months/2026-11/confirm`, {});
    await call('POST', '/api/movements', {
      date: '2026-11-10',
      kind: 'expense',
      categoryId: leisure,
      concept: 'Cine',
      amountCents: 4_000,
    });
    const [november] = (await projection('?today=2026-11-15&to=2026-12')).months;
    // Salary: the confirmed 2.000 only (not twice). Rent: pending 700. Ocio: 40 spent + 60 left of 100.
    expect(november).toMatchObject({
      incomeCents: 200_000,
      expenseCents: 80_000,
      accumulatedCents: 350_000,
    });
    expect(november?.byCategory).toEqual(
      expect.arrayContaining([
        { categoryId: pay, cents: 200_000 },
        { categoryId: housing, cents: 70_000 },
        { categoryId: leisure, cents: 10_000 },
      ]),
    );
  });

  it('a confirmed amount that differs from the expected one is what counts this month', async () => {
    await call('POST', `/api/recurring-items/${String(rentItem)}/months/2026-11/confirm`, {
      amountCents: 72_500,
    });
    const [november, december] = (await projection('?today=2026-11-15&to=2026-12')).months;
    expect(november?.expenseCents).toBe(72_500 + 10_000); // rent 725 paid, Ocio 100 budget (the salary is income)
    expect(december?.expenseCents).toBe(80_000); // next months use the expected amount
  });

  it('a skipped item is left out of its month only', async () => {
    await call('POST', `/api/recurring-items/${String(rentItem)}/months/2026-12/skip`);
    const result = await projection('?today=2026-11-15&to=2027-01');
    expect(result.months.map((m) => m.expenseCents)).toEqual([80_000, 10_000, 80_000]);
  });

  it('does not count movements already inside the initial balance', async () => {
    // The initial balance moves to 2026-11-05: October is before it, and a movement on the 3rd is in it.
    await call('PUT', '/api/settings', {
      initialSavingsCents: 500_000,
      initialSavingsDate: '2026-11-05',
    });
    await call('POST', '/api/movements', {
      date: '2026-11-03',
      kind: 'expense',
      categoryId: leisure,
      concept: 'Antes del saldo',
      amountCents: 9_000,
    });
    const result = await projection('?today=2026-11-15&to=2026-11');
    expect(result.baselineCents).toBe(500_000);
    // Ocio: the 90 spent on the 3rd is not counted, so the whole 100 budget remains.
    expect(result.months[0]?.expenseCents).toBe(70_000 + 10_000);
  });

  it('without an initial balance it adds up every movement', async () => {
    const fresh = openDatabase(':memory:');
    const other = buildApp({ db: fresh.db });
    const cat = (
      await other.inject({
        method: 'POST',
        url: '/api/categories',
        payload: { name: 'Nómina', kind: 'income' },
      })
    ).json<CategoryDto>().id;
    await other.inject({
      method: 'POST',
      url: '/api/movements',
      payload: {
        date: '2026-05-01',
        kind: 'income',
        categoryId: cat,
        concept: 'x',
        amountCents: 12_345,
      },
    });
    const result = (
      await other.inject({ method: 'GET', url: '/api/projection?today=2026-11-15&to=2026-11' })
    ).json<ProjectionDto>();
    expect(result.baselineCents).toBe(12_345);
    expect(result.months).toHaveLength(1);
    await other.close();
    fresh.close();
  });

  it('defaults to twelve months, today included', async () => {
    const result = await projection('?today=2026-11-15');
    expect(result.months).toHaveLength(12);
    expect(result.months[0]?.month).toBe('2026-11');
    expect(result.months.at(-1)?.month).toBe('2027-10');
  });

  it('returns the goals and the categories for scenarios', async () => {
    await call('POST', '/api/goals', {
      name: 'Fondo',
      targetAmountCents: 600_000,
      targetDate: '2027-06-30',
    });
    const result = await projection('?today=2026-11-15&to=2026-12');
    expect(result.goals).toEqual([
      expect.objectContaining({
        name: 'Fondo',
        targetAmountCents: 600_000,
        targetDate: '2027-06-30',
      }),
    ]);
    expect(result.categories.map((c) => c.name)).toEqual(['Nómina', 'Ocio', 'Vivienda']);
  });

  it('reaches a ten-year range', async () => {
    const result = await projection('?today=2026-11-15&to=2036-10');
    expect(result.months).toHaveLength(120);
  });

  it('rejects a bad range with messages on the field', async () => {
    const cases: [string, RegExp][] = [
      ['?today=2026-11-15&to=2026-10', /anterior al mes actual/],
      ['?today=2026-11-15&to=2036-11', /más de 120 meses/],
      ['?today=2026-11-15&to=2026-13', /formato AAAA-MM/],
    ];
    for (const [query, message] of cases) {
      const response = await call('GET', `/api/projection${query}`);
      expect(response.statusCode, query).toBe(400);
      expect(response.json<{ fields: Record<string, string> }>().fields.to, query).toMatch(message);
    }
    expect((await call('GET', '/api/projection?today=ayer')).statusCode).toBe(400);
    expect((await call('GET', '/api/projection?foo=1')).statusCode).toBe(400);
  });

  it('works on an empty database', async () => {
    const fresh = openDatabase(':memory:');
    const other = buildApp({ db: fresh.db });
    const result = (
      await other.inject({ method: 'GET', url: '/api/projection?today=2026-11-15&to=2026-12' })
    ).json<ProjectionDto>();
    expect(result.baselineCents).toBe(0);
    expect(result.months.map((m) => m.accumulatedCents)).toEqual([0, 0]);
    await other.close();
    fresh.close();
  });
});
