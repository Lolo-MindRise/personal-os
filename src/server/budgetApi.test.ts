import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BudgetMonthDto, CategoryDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { budgetForMonth } from './db/budget.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

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

const month = async (m: string) =>
  (await app.inject({ method: 'GET', url: `/api/months/${m}/budget` })).json<BudgetMonthDto>();
const post = (payload: unknown) =>
  app.inject({ method: 'POST', url: '/api/budget-lines', payload: payload as object });
const categoryId = async (name: string) =>
  (await app.inject({ method: 'GET', url: '/api/categories' }))
    .json<CategoryDto[]>()
    .find((c) => c.name === name)?.id ?? -1;

describe('GET /api/months/:month/budget', () => {
  it('has a row per expense category with budget, confirmed actual and difference', async () => {
    const jan = await month('2026-01');
    expect(jan.rows.map((r) => r.categoryName)).toEqual([
      'Ocio',
      'Suministros',
      'Supermercado',
      'Vivienda',
    ]);
    const row = (name: string) => jan.rows.find((r) => r.categoryName === name);
    expect(row('Vivienda')).toMatchObject({
      budgetCents: 70_000,
      actualCents: 70_000,
      differenceCents: 0,
    });
    expect(row('Supermercado')).toMatchObject({
      budgetCents: 35_000,
      actualCents: 17_670,
      differenceCents: 17_330,
    });
    expect(row('Ocio')).toMatchObject({
      budgetCents: 10_000,
      actualCents: 2_400,
      differenceCents: 7_600,
    });
    // No budget line: shown, with its actual, and no difference.
    expect(row('Suministros')).toMatchObject({
      budgetCents: null,
      actualCents: 0,
      differenceCents: null,
    });
  });

  it('totals the rows', async () => {
    expect((await month('2026-01')).totals).toEqual({
      budgetCents: 115_000,
      actualCents: 90_070,
      differenceCents: 24_930,
    });
  });

  it('counts only confirmed movements of that month (not pending fixed items)', async () => {
    // February: nothing confirmed, although every fixed item is pending.
    const feb = await month('2026-02');
    expect(feb.rows.every((r) => r.actualCents === 0)).toBe(true);
    expect(feb.rows.find((r) => r.categoryName === 'Vivienda')?.budgetCents).toBe(70_000);
  });

  it('agrees with budgetForMonth for the budget in effect', async () => {
    await post({ categoryId: await categoryId('Ocio'), amountCents: 12_000, validFrom: '2026-04' });
    const ocio = await categoryId('Ocio');
    for (const m of ['2025-12', '2026-01', '2026-03', '2026-04', '2027-01']) {
      const row = (await month(m)).rows.find((r) => r.categoryId === ocio);
      expect(row?.budgetCents ?? null).toBe(
        budgetForMonth(handle.db, ocio, m)?.amountCents ?? null,
      );
    }
  });

  it.each(['2026-1', '2026-13', 'abc'])('returns 400 for the malformed month %j', async (m) => {
    const response = await app.inject({ method: 'GET', url: `/api/months/${m}/budget` });
    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/budget-lines', () => {
  it('adds a line from a month onwards and never edits earlier months', async () => {
    const ocio = await categoryId('Ocio');
    const response = await post({ categoryId: ocio, amountCents: 15_000, validFrom: '2026-03' });
    expect(response.statusCode).toBe(201);
    // The response is the budget of the month it starts from.
    expect(response.json<BudgetMonthDto>().rows.find((r) => r.categoryId === ocio)).toMatchObject({
      budgetCents: 15_000,
      budgetFrom: '2026-03',
    });
    const at = async (m: string) => (await month(m)).rows.find((r) => r.categoryId === ocio);
    expect((await at('2026-02'))?.budgetCents).toBe(10_000);
    expect((await at('2026-03'))?.budgetCents).toBe(15_000);
    expect((await at('2027-06'))?.budgetCents).toBe(15_000);
  });

  it('can start a budget for a category that had none', async () => {
    const utilities = await categoryId('Suministros');
    await post({ categoryId: utilities, amountCents: 9_000, validFrom: '2026-02' });
    expect(
      (await month('2026-01')).rows.find((r) => r.categoryId === utilities)?.budgetCents,
    ).toBeNull();
    expect((await month('2026-02')).rows.find((r) => r.categoryId === utilities)?.budgetCents).toBe(
      9_000,
    );
  });

  it('keeps history: a second line for the same category and month is refused (409)', async () => {
    const ocio = await categoryId('Ocio');
    const response = await post({ categoryId: ocio, amountCents: 99_999, validFrom: '2026-01' });
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toMatch(/historial/);
    expect((await month('2026-01')).rows.find((r) => r.categoryId === ocio)?.budgetCents).toBe(
      10_000,
    );
  });

  it.each([
    ['zero amount', { amountCents: 0 }, 'amountCents'],
    ['float amount', { amountCents: 10.5 }, 'amountCents'],
    ['negative amount', { amountCents: -1 }, 'amountCents'],
    ['bad month', { validFrom: '2026-13' }, 'validFrom'],
    ['full date', { validFrom: '2026-01-01' }, 'validFrom'],
    ['missing category', { categoryId: undefined }, 'categoryId'],
  ])('rejects %s with 400', async (_label, override, field) => {
    const body = {
      categoryId: await categoryId('Ocio'),
      amountCents: 100,
      validFrom: '2026-05',
      ...override,
    };
    const response = await post(body);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty(field);
  });

  it('rejects an unknown category (400)', async () => {
    const response = await post({ categoryId: 9999, amountCents: 100, validFrom: '2026-05' });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty('categoryId');
  });
});
