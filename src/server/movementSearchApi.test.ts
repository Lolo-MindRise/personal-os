import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto, MovementSearchDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';

// Task 0013, block 3: search and filter movements across all months. Invented data.

let handle: DbHandle;
let app: FastifyInstance;
let food: number;
let pay: number;
let loan: number;

beforeEach(async () => {
  handle = openDatabase(':memory:');
  app = buildApp({ db: handle.db });
  const category = async (name: string, kind: CategoryDto['kind']) =>
    (
      await app.inject({ method: 'POST', url: '/api/categories', payload: { name, kind } })
    ).json<CategoryDto>().id;
  food = await category('Supermercado', 'expense');
  pay = await category('Nómina', 'income');
  loan = await category('Préstamos', 'repayment');

  const add = (
    date: string,
    kind: 'income' | 'expense' | 'repayment',
    categoryId: number,
    concept: string,
    amountCents: number,
    notes?: string,
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/movements',
      payload: { date, kind, categoryId, concept, amountCents, ...(notes ? { notes } : {}) },
    });
  await add('2025-12-30', 'expense', food, 'Compra Mercadona', 4_550);
  await add('2026-01-02', 'income', pay, 'Nómina enero', 200_000, 'Empresa de ejemplo');
  await add('2026-01-15', 'expense', food, 'Mercadona', 1_000);
  await add('2026-02-01', 'repayment', loan, 'Cuota préstamo', 15_000);
  await add('2026-02-10', 'expense', food, 'Panadería', 250, 'pan y bollería de Mercadona');
  await add('2026-03-05', 'expense', food, 'Café', 1_200);
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const search = async (query: string) =>
  app.inject({ method: 'GET', url: `/api/movements/search${query}` });
const run = async (query = '') => (await search(query)).json<MovementSearchDto>();
const concepts = (result: MovementSearchDto) => result.rows.map((m) => m.concept);

describe('GET /api/movements/search', () => {
  it('without filters lists every movement across months, newest first, with totals', async () => {
    const result = await run();
    expect(concepts(result)).toEqual([
      'Café',
      'Panadería',
      'Cuota préstamo',
      'Mercadona',
      'Nómina enero',
      'Compra Mercadona',
    ]);
    expect(result).toMatchObject({ page: 1, pageSize: 50, count: 6, pageCount: 1 });
    expect(result.totals).toEqual({
      incomeCents: 200_000,
      expenseCents: 4_550 + 1_000 + 250 + 1_200,
      repaymentCents: 15_000,
      netCents: 200_000 - 7_000 - 15_000,
    });
  });

  it('text matches concept or notes, ignoring case and accents', async () => {
    expect(concepts(await run('?q=mercadona'))).toEqual([
      'Panadería',
      'Mercadona',
      'Compra Mercadona',
    ]);
    expect(concepts(await run('?q=PANADERIA'))).toEqual(['Panadería']);
    expect(concepts(await run('?q=bolleria'))).toEqual(['Panadería']); // only in the notes
    expect(concepts(await run('?q=nomina'))).toEqual(['Nómina enero']);
    expect(concepts(await run('?q=zzz'))).toEqual([]);
    expect((await run('?q=')).count).toBe(6); // empty text is no filter
  });

  it('filters by category and by kind', async () => {
    expect(concepts(await run(`?categoryId=${String(pay)}`))).toEqual(['Nómina enero']);
    expect((await run('?kind=expense')).count).toBe(4);
    expect(concepts(await run('?kind=repayment'))).toEqual(['Cuota préstamo']);
    expect(concepts(await run(`?kind=expense&categoryId=${String(loan)}`))).toEqual([]);
  });

  it('filters by date range, both ends included, across years', async () => {
    expect(concepts(await run('?from=2026-01-02&to=2026-02-01'))).toEqual([
      'Cuota préstamo',
      'Mercadona',
      'Nómina enero',
    ]);
    expect(concepts(await run('?from=2026-03-01'))).toEqual(['Café']);
    expect(concepts(await run('?to=2025-12-31'))).toEqual(['Compra Mercadona']);
  });

  it('filters by amount range in cents, both ends included', async () => {
    expect(concepts(await run('?minAmountCents=1000&maxAmountCents=1200'))).toEqual([
      'Café',
      'Mercadona',
    ]);
    expect(concepts(await run('?minAmountCents=100000'))).toEqual(['Nómina enero']);
    expect(concepts(await run('?maxAmountCents=250'))).toEqual(['Panadería']);
  });

  it('combines every filter, and the totals follow the filtered set', async () => {
    const result = await run(
      `?q=mercadona&kind=expense&categoryId=${String(food)}&from=2026-01-01&to=2026-12-31&minAmountCents=100&maxAmountCents=2000`,
    );
    expect(concepts(result)).toEqual(['Panadería', 'Mercadona']);
    expect(result.totals).toEqual({
      incomeCents: 0,
      expenseCents: 1_250,
      repaymentCents: 0,
      netCents: -1_250,
    });
    expect(result.count).toBe(2);
  });

  it('paginates, with totals over the whole filtered set rather than the page', async () => {
    const first = await run('?pageSize=4&page=1');
    expect(concepts(first)).toEqual(['Café', 'Panadería', 'Cuota préstamo', 'Mercadona']);
    expect(first).toMatchObject({ page: 1, pageSize: 4, count: 6, pageCount: 2 });
    const second = await run('?pageSize=4&page=2');
    expect(concepts(second)).toEqual(['Nómina enero', 'Compra Mercadona']);
    expect(second.totals).toEqual(first.totals);
    // Past the last page: no rows, but the count and totals are still right.
    const beyond = await run('?pageSize=4&page=9');
    expect(beyond.rows).toEqual([]);
    expect(beyond).toMatchObject({ count: 6, pageCount: 2 });
  });

  it('an empty result has zero totals and zero pages', async () => {
    expect(await run('?q=zzz')).toMatchObject({
      rows: [],
      count: 0,
      pageCount: 0,
      totals: { incomeCents: 0, expenseCents: 0, repaymentCents: 0, netCents: 0 },
    });
  });

  it('treats empty parameters as not given', async () => {
    const result = await run(
      '?q=&categoryId=&kind=&from=&to=&minAmountCents=&maxAmountCents=&page=&pageSize=',
    );
    expect(result.count).toBe(6);
  });

  it('rejects invalid filters with messages per field', async () => {
    const cases: [string, string][] = [
      ['?kind=nope', 'kind'],
      ['?from=2026-02-30', 'from'],
      ['?to=ayer', 'to'],
      ['?categoryId=abc', 'categoryId'],
      ['?categoryId=0', 'categoryId'],
      ['?minAmountCents=-1', 'minAmountCents'],
      ['?minAmountCents=1.5', 'minAmountCents'],
      ['?page=0', 'page'],
      ['?pageSize=0', 'pageSize'],
      ['?pageSize=201', 'pageSize'],
      ['?unknown=1', '_'],
    ];
    for (const [query, field] of cases) {
      const response = await search(query);
      expect(response.statusCode, query).toBe(400);
      expect(
        Object.keys(response.json<{ fields: Record<string, string> }>().fields),
        query,
      ).toContain(field);
    }
  });

  it('rejects an inverted date or amount range', async () => {
    const dates = await search('?from=2026-03-01&to=2026-01-01');
    expect(dates.statusCode).toBe(400);
    expect(dates.json<{ fields: Record<string, string> }>().fields.to).toMatch(/fecha final/);
    const amounts = await search('?minAmountCents=500&maxAmountCents=100');
    expect(amounts.statusCode).toBe(400);
    expect(amounts.json<{ fields: Record<string, string> }>().fields.maxAmountCents).toMatch(
      /máximo/,
    );
  });

  it('does not treat % or _ in the text as wildcards', async () => {
    expect(concepts(await run('?q=%25'))).toEqual([]);
    expect(concepts(await run('?q=_'))).toEqual([]);
  });

  it('still lists a month through the existing endpoint', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/movements?month=2026-01' });
    expect(response.json<unknown[]>()).toHaveLength(2);
  });
});
