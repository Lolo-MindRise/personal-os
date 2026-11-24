import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto, MonthSummaryDto, MovementDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

let handle: DbHandle;
let app: FastifyInstance;

beforeEach(() => {
  handle = openDatabase(':memory:');
  seed(handle.db); // fictional January 2026: see seed.ts
  app = buildApp({ db: handle.db });
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const get = (url: string) => app.inject({ method: 'GET', url });
const send = (method: 'POST' | 'PATCH', url: string, payload: unknown) =>
  app.inject({ method, url, payload: payload as object });

async function categoryId(name: string): Promise<number> {
  const all = (await get('/api/categories')).json<CategoryDto[]>();
  const found = all.find((c) => c.name === name);
  if (found === undefined) {
    throw new Error(`seed category ${name} missing`);
  }
  return found.id;
}

const validMovement = async () => ({
  date: '2026-02-03',
  kind: 'expense',
  categoryId: await categoryId('Supermercado'),
  concept: 'Fruta',
  amountCents: 1_234,
});

describe('GET /api/categories', () => {
  it('lists all categories ordered by name', async () => {
    const response = await get('/api/categories');
    const names = response.json<CategoryDto[]>().map((c) => c.name);
    expect(response.statusCode).toBe(200);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toContain('Supermercado');
  });

  it('filters by kind', async () => {
    const rows = (await get('/api/categories?kind=income')).json<CategoryDto[]>();
    expect(rows).toHaveLength(1);
    expect(rows.every((c) => c.kind === 'income')).toBe(true);
  });

  it('returns 400 for an unknown kind', async () => {
    const response = await get('/api/categories?kind=transfer');
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty('kind');
  });
});

describe('GET /api/movements', () => {
  it("returns the month's movements newest first, with the category name", async () => {
    const response = await get('/api/movements?month=2026-01');
    const rows = response.json<MovementDto[]>();
    expect(response.statusCode).toBe(200);
    expect(rows).toHaveLength(6);
    const dates = rows.map((r) => r.date);
    expect(dates).toEqual([...dates].sort().reverse());
    expect(rows[0]).toMatchObject({
      date: '2026-01-25',
      kind: 'repayment',
      categoryName: 'Amortización extra',
    });
  });

  it('returns only the requested month', async () => {
    await send('POST', '/api/movements', await validMovement());
    expect((await get('/api/movements?month=2026-02')).json<MovementDto[]>()).toHaveLength(1);
    expect((await get('/api/movements?month=2026-03')).json<MovementDto[]>()).toEqual([]);
  });

  it.each(['', '?month=2026-1', '?month=2026-13', '?month=2026-01-01'])(
    'returns 400 for a missing or malformed month %j',
    async (query) => {
      const response = await get(`/api/movements${query}`);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ error: string }>().error).toMatch(/AAAA-MM/);
    },
  );
});

describe('POST /api/movements', () => {
  it('creates a movement and returns it with 201', async () => {
    const response = await send('POST', '/api/movements', {
      ...(await validMovement()),
      notes: 'Mercado',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<MovementDto>()).toMatchObject({
      date: '2026-02-03',
      kind: 'expense',
      categoryName: 'Supermercado',
      concept: 'Fruta',
      amountCents: 1_234,
      notes: 'Mercado',
      debtId: null,
    });
    expect((await get('/api/movements?month=2026-02')).json<MovementDto[]>()).toHaveLength(1);
  });

  it.each([
    ['float amount', { amountCents: 12.5 }, 'amountCents'],
    ['zero amount', { amountCents: 0 }, 'amountCents'],
    ['negative amount', { amountCents: -5 }, 'amountCents'],
    ['string amount', { amountCents: '12,50' }, 'amountCents'],
    ['impossible date', { date: '2026-02-30' }, 'date'],
    ['blank concept', { concept: '  ' }, 'concept'],
    ['unknown kind', { kind: 'transfer' }, 'kind'],
    ['unknown field', { surprise: true }, '_'],
  ])('returns 400 with the field for %s', async (_name, change, field) => {
    const response = await send('POST', '/api/movements', {
      ...(await validMovement()),
      ...change,
    });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string; fields: Record<string, string> }>();
    expect(body.error).toBe('Datos no válidos.');
    expect(body.fields).toHaveProperty(field);
  });

  it('returns 400 when the body is missing', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/movements' });
    expect(response.statusCode).toBe(400);
  });

  it("returns 400, not 500, when the kind does not match the category's kind", async () => {
    const response = await send('POST', '/api/movements', {
      ...(await validMovement()),
      kind: 'income',
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty('kind');
  });

  it('returns 400 for an unknown category', async () => {
    const response = await send('POST', '/api/movements', {
      ...(await validMovement()),
      categoryId: 9999,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty('categoryId');
  });

  it('rejects a debt on a non-repayment movement and an unknown debt', async () => {
    const withDebt = await send('POST', '/api/movements', {
      ...(await validMovement()),
      debtId: 1,
    });
    expect(withDebt.statusCode).toBe(400);
    expect(withDebt.json<{ fields: Record<string, string> }>().fields).toHaveProperty('debtId');

    const repayment = {
      date: '2026-02-03',
      kind: 'repayment',
      categoryId: await categoryId('Amortización extra'),
      concept: 'Extra',
      amountCents: 5_000,
    };
    expect((await send('POST', '/api/movements', { ...repayment, debtId: 1 })).statusCode).toBe(
      201,
    );
    const unknownDebt = await send('POST', '/api/movements', { ...repayment, debtId: 999 });
    expect(unknownDebt.statusCode).toBe(400);
  });
});

describe('PATCH /api/movements/:id', () => {
  it('updates only the given fields', async () => {
    const created = (
      await send('POST', '/api/movements', await validMovement())
    ).json<MovementDto>();
    const response = await send('PATCH', `/api/movements/${String(created.id)}`, {
      concept: 'Fruta y verdura',
      amountCents: 2_000,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<MovementDto>()).toMatchObject({
      id: created.id,
      date: '2026-02-03',
      concept: 'Fruta y verdura',
      amountCents: 2_000,
    });
  });

  it('can clear the notes with null', async () => {
    const created = (
      await send('POST', '/api/movements', { ...(await validMovement()), notes: 'x' })
    ).json<MovementDto>();
    const response = await send('PATCH', `/api/movements/${String(created.id)}`, { notes: null });
    expect(response.json<MovementDto>().notes).toBeNull();
  });

  it('changes kind and category together, but rejects a mismatch', async () => {
    const created = (
      await send('POST', '/api/movements', await validMovement())
    ).json<MovementDto>();
    const url = `/api/movements/${String(created.id)}`;

    const mismatch = await send('PATCH', url, { kind: 'income' });
    expect(mismatch.statusCode).toBe(400);
    const otherKind = await send('PATCH', url, { categoryId: await categoryId('Nómina ficticia') });
    expect(otherKind.statusCode).toBe(400);

    const both = await send('PATCH', url, {
      kind: 'income',
      categoryId: await categoryId('Nómina ficticia'),
    });
    expect(both.statusCode).toBe(200);
    expect(both.json<MovementDto>()).toMatchObject({
      kind: 'income',
      categoryName: 'Nómina ficticia',
    });
  });

  it('refuses to leave a debt on a movement that stops being a repayment', async () => {
    const repayment = (
      await send('POST', '/api/movements', {
        date: '2026-02-03',
        kind: 'repayment',
        categoryId: await categoryId('Amortización extra'),
        concept: 'Extra',
        amountCents: 5_000,
        debtId: 1,
      })
    ).json<MovementDto>();
    const response = await send('PATCH', `/api/movements/${String(repayment.id)}`, {
      kind: 'expense',
      categoryId: await categoryId('Supermercado'),
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty('debtId');
  });

  it('returns 400 for invalid values and unknown fields', async () => {
    const created = (
      await send('POST', '/api/movements', await validMovement())
    ).json<MovementDto>();
    const url = `/api/movements/${String(created.id)}`;
    expect((await send('PATCH', url, { amountCents: 0 })).statusCode).toBe(400);
    expect((await send('PATCH', url, { date: '2026-02-31' })).statusCode).toBe(400);
    expect((await send('PATCH', url, { id: 5 })).statusCode).toBe(400);
  });

  it.each(['9999', 'abc', '0', '-1', '1.5'])('returns 404 for the id %s', async (id) => {
    const response = await send('PATCH', `/api/movements/${id}`, { concept: 'x' });
    expect(response.statusCode).toBe(404);
    expect(response.json<{ error: string }>().error).toMatch(/No se ha encontrado/);
  });
});

describe('DELETE /api/movements/:id', () => {
  it('deletes a movement with 204 and then it is gone', async () => {
    const created = (
      await send('POST', '/api/movements', await validMovement())
    ).json<MovementDto>();
    const url = `/api/movements/${String(created.id)}`;
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(204);
    expect((await get('/api/movements?month=2026-02')).json<MovementDto[]>()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url })).statusCode).toBe(404);
  });

  it('returns 404 for an unknown or malformed id', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/api/movements/9999' })).statusCode).toBe(
      404,
    );
    expect((await app.inject({ method: 'DELETE', url: '/api/movements/abc' })).statusCode).toBe(
      404,
    );
  });
});

describe('GET /api/months/:month/summary', () => {
  it('totals the seeded month in cents', async () => {
    const response = await get('/api/months/2026-01/summary');
    expect(response.statusCode).toBe(200);
    // Seed: income 200000; expenses 70000 + 8550 + 9120 + 2400; repayment 10000.
    expect(response.json<MonthSummaryDto>()).toEqual({
      month: '2026-01',
      incomeCents: 200_000,
      expenseCents: 90_070,
      repaymentCents: 10_000,
      savingsCents: 99_930,
    });
  });

  it('returns zeros for an empty month', async () => {
    expect((await get('/api/months/2030-05/summary')).json<MonthSummaryDto>()).toEqual({
      month: '2030-05',
      incomeCents: 0,
      expenseCents: 0,
      repaymentCents: 0,
      savingsCents: 0,
    });
  });

  it('reports a negative saving when the month is in deficit, and follows edits', async () => {
    await send('POST', '/api/movements', {
      ...(await validMovement()),
      date: '2026-03-01',
      amountCents: 5_000,
    });
    const summary = (await get('/api/months/2026-03/summary')).json<MonthSummaryDto>();
    expect(summary.expenseCents).toBe(5_000);
    expect(summary.savingsCents).toBe(-5_000);
  });

  it('includes the first and last day of the month and nothing else', async () => {
    for (const date of ['2026-04-01', '2026-04-30', '2026-03-31', '2026-05-01']) {
      await send('POST', '/api/movements', { ...(await validMovement()), date, amountCents: 100 });
    }
    expect((await get('/api/months/2026-04/summary')).json<MonthSummaryDto>().expenseCents).toBe(
      200,
    );
  });

  it('returns 400 for a malformed month', async () => {
    expect((await get('/api/months/2026-1/summary')).statusCode).toBe(400);
    expect((await get('/api/months/abril/summary')).statusCode).toBe(400);
  });
});
