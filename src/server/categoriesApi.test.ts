import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto, CategoryUsageDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { budgetLines } from './db/schema.js';
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

const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject(payload === undefined ? { method, url } : { method, url, payload: payload as object });
const usage = async () =>
  (await app.inject({ method: 'GET', url: '/api/categories/usage' })).json<CategoryUsageDto[]>();
const byName = async (name: string) => {
  const found = (await usage()).find((c) => c.name === name);
  if (found === undefined) {
    throw new Error(`missing ${name}`);
  }
  return found;
};

describe('GET /api/categories/usage', () => {
  it('counts movements, recurring items and budget lines per category', async () => {
    const rent = await byName('Vivienda');
    expect(rent.movements).toBeGreaterThan(0);
    expect(rent.recurringItems).toBeGreaterThan(0);
    const leisure = await byName('Ocio');
    expect(leisure).toMatchObject({ movements: 1, recurringItems: 1, budgetLines: 1 });
    const groceries = await byName('Supermercado');
    expect(groceries).toMatchObject({ movements: 2, recurringItems: 0, budgetLines: 1 });
    expect((await byName('Amortización extra')).budgetLines).toBe(0);
  });
});

describe('POST /api/categories', () => {
  it('creates a category with 201', async () => {
    const response = await send('POST', '/api/categories', { name: ' Mascotas ', kind: 'expense' });
    expect(response.statusCode).toBe(201);
    expect(response.json<CategoryDto>()).toMatchObject({ name: 'Mascotas', kind: 'expense' });
  });

  it.each([
    ['blank name', { name: '  ', kind: 'expense' }, 'name'],
    ['unknown kind', { name: 'X', kind: 'transfer' }, 'kind'],
    ['extra field', { name: 'X', kind: 'expense', id: 3 }, '_'],
  ])('rejects %s with 400', async (_label, body, field) => {
    const response = await send('POST', '/api/categories', body);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty(field);
  });

  it('keeps names unique, ignoring case and spaces, across kinds (409)', async () => {
    for (const name of ['Ocio', 'ocio', ' OCIO ']) {
      const response = await send('POST', '/api/categories', { name, kind: 'income' });
      expect(response.statusCode).toBe(409);
      expect(response.json<{ error: string }>().error).toMatch(/Ya existe/);
    }
  });
});

describe('PATCH /api/categories/:id', () => {
  it('renames a category, even one with movements', async () => {
    const rent = await byName('Vivienda');
    const response = await send('PATCH', `/api/categories/${String(rent.id)}`, { name: 'Casa' });
    expect(response.statusCode).toBe(200);
    expect(response.json<CategoryDto>()).toEqual({ id: rent.id, name: 'Casa', kind: 'expense' });
    const movements = await app.inject({ method: 'GET', url: '/api/movements?month=2026-01' });
    expect(movements.body).toContain('Casa');
  });

  it('allows changing only the letter case of its own name', async () => {
    const leisure = await byName('Ocio');
    const response = await send('PATCH', `/api/categories/${String(leisure.id)}`, { name: 'OCIO' });
    expect(response.statusCode).toBe(200);
  });

  it('rejects a name taken by another category (409)', async () => {
    const leisure = await byName('Ocio');
    const response = await send('PATCH', `/api/categories/${String(leisure.id)}`, {
      name: 'Vivienda',
    });
    expect(response.statusCode).toBe(409);
  });

  it('does not accept a kind change (400) and 404s for unknown or malformed ids', async () => {
    const leisure = await byName('Ocio');
    expect(
      (await send('PATCH', `/api/categories/${String(leisure.id)}`, { name: 'Z', kind: 'income' }))
        .statusCode,
    ).toBe(400);
    expect((await send('PATCH', '/api/categories/9999', { name: 'Z' })).statusCode).toBe(404);
    expect((await send('PATCH', '/api/categories/abc', { name: 'Z' })).statusCode).toBe(404);
  });
});

describe('DELETE /api/categories/:id', () => {
  it('deletes a category nothing points at (204)', async () => {
    const created = (
      await send('POST', '/api/categories', { name: 'Temporal', kind: 'expense' })
    ).json<CategoryDto>();
    expect((await send('DELETE', `/api/categories/${String(created.id)}`)).statusCode).toBe(204);
    expect((await usage()).some((c) => c.id === created.id)).toBe(false);
  });

  it('refuses a category with movements (409) and keeps it', async () => {
    const groceries = await byName('Supermercado');
    expect(groceries.movements).toBeGreaterThan(0);
    const response = await send('DELETE', `/api/categories/${String(groceries.id)}`);
    expect(response.statusCode).toBe(409);
    expect(response.json<{ error: string }>().error).toMatch(/No se puede eliminar/);
    expect((await byName('Supermercado')).id).toBe(groceries.id);
  });

  it('refuses a category used only by a recurring item', async () => {
    const created = (
      await send('POST', '/api/categories', { name: 'Solo fijo', kind: 'expense' })
    ).json<CategoryDto>();
    const item = await app.inject({
      method: 'POST',
      url: '/api/recurring-items',
      payload: {
        kind: 'expense',
        categoryId: created.id,
        concept: 'Algo',
        amountCents: 100,
        expectedDay: 1,
        startMonth: '2026-01',
      },
    });
    expect(item.statusCode).toBe(201);
    expect((await send('DELETE', `/api/categories/${String(created.id)}`)).statusCode).toBe(409);
  });

  it('refuses a category used only by a budget line', async () => {
    const created = (
      await send('POST', '/api/categories', { name: 'Solo presupuesto', kind: 'expense' })
    ).json<CategoryDto>();
    handle.db
      .insert(budgetLines)
      .values({ categoryId: created.id, amountCents: 5_000, validFrom: '2026-01' })
      .run();
    expect((await send('DELETE', `/api/categories/${String(created.id)}`)).statusCode).toBe(409);
  });

  it('404s for an unknown id', async () => {
    expect((await send('DELETE', '/api/categories/9999')).statusCode).toBe(404);
  });
});
