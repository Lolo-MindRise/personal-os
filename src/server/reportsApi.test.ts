import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto } from '../shared/api.js';
import type { ExpenseReportDto } from '../shared/reports.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

let handle: DbHandle;
let app: FastifyInstance;

beforeEach(async () => {
  handle = openDatabase(':memory:');
  seed(handle.db);
  app = buildApp({ db: handle.db });
  await app.ready();
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const report = async (query: string) =>
  app.inject({ method: 'GET', url: `/api/reports/expenses?${query}` });

const total = (dto: ExpenseReportDto, month: string, name: string) => {
  const id = dto.categories.find((c) => c.name === name)?.id;
  return dto.totals.find((t) => t.month === month && t.categoryId === id)?.cents ?? 0;
};

describe('GET /api/reports/expenses', () => {
  it('sums expenses per category and month, like the budget does', async () => {
    const response = await report('month=2026-03&months=3');
    expect(response.statusCode).toBe(200);
    const dto = response.json<ExpenseReportDto>();
    expect(dto).toMatchObject({ month: '2026-03', months: 3 });
    // Seed, January 2026: Vivienda 700,00, Supermercado 176,70, Ocio 24,00 (the repayment is not
    // an expense and the income is not either).
    expect(total(dto, '2026-01', 'Vivienda')).toBe(70_000);
    expect(total(dto, '2026-01', 'Supermercado')).toBe(17_670);
    expect(total(dto, '2026-01', 'Ocio')).toBe(2_400);
    expect(dto.totals).toHaveLength(3);
    // Same figure as the budget screen for the month.
    const budget = (await app.inject({ method: 'GET', url: '/api/months/2026-01/budget' })).json<{
      rows: { categoryName: string; actualCents: number }[];
    }>();
    for (const name of ['Vivienda', 'Supermercado', 'Ocio']) {
      expect(budget.rows.find((r) => r.categoryName === name)?.actualCents).toBe(
        total(dto, '2026-01', name),
      );
    }
  });

  it('covers the period and the previous one, and nothing outside', async () => {
    const all = (await app.inject({ method: 'GET', url: '/api/categories' })).json<CategoryDto[]>();
    const ocio = all.find((c) => c.name === 'Ocio')?.id;
    const add = (date: string, amountCents: number) =>
      app.inject({
        method: 'POST',
        url: '/api/movements',
        payload: { date, kind: 'expense', categoryId: ocio, concept: 'Prueba', amountCents },
      });
    await add('2025-12-31', 100);
    await add('2025-11-30', 200); // previous period of 3 months ending 2026-02 starts 2025-09
    await add('2025-08-31', 400); // before the window
    await add('2026-03-01', 800); // after the window
    const dto = (await report('month=2026-02&months=3')).json<ExpenseReportDto>();
    expect(total(dto, '2025-12', 'Ocio')).toBe(100);
    expect(total(dto, '2025-11', 'Ocio')).toBe(200);
    expect(total(dto, '2025-08', 'Ocio')).toBe(0);
    expect(total(dto, '2026-03', 'Ocio')).toBe(0);
    expect(total(dto, '2026-01', 'Ocio')).toBe(2_400);
  });

  it('lists only expense categories and defaults to 6 months', async () => {
    const dto = (await report('month=2026-01')).json<ExpenseReportDto>();
    expect(dto.months).toBe(6);
    const all = (await app.inject({ method: 'GET', url: '/api/categories?kind=expense' })).json<
      CategoryDto[]
    >();
    expect(dto.categories.map((c) => c.id).sort()).toEqual(all.map((c) => c.id).sort());
  });

  it('rejects a bad month or period', async () => {
    expect((await report('month=2026-13&months=3')).statusCode).toBe(400);
    expect((await report('month=2026-01&months=4')).statusCode).toBe(400);
    expect((await report('month=2026-01&months=abc')).statusCode).toBe(400);
  });
});
