import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto, CategorySuggestionDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';

// Task 0003-07: the category suggestion. Invented data.

let handle: DbHandle;
let app: FastifyInstance;
let food: number;
let eatingOut: number;
let pay: number;

const category = async (name: string, kind: CategoryDto['kind']) =>
  (
    await app.inject({ method: 'POST', url: '/api/categories', payload: { name, kind } })
  ).json<CategoryDto>().id;

const add = async (
  date: string,
  kind: 'income' | 'expense',
  categoryId: number,
  concept: string,
): Promise<number> =>
  (
    await app.inject({
      method: 'POST',
      url: '/api/movements',
      payload: { date, kind, categoryId, concept, amountCents: 1_000 },
    })
  ).json<{ id: number }>().id;

const suggest = async (kind: string, concept: string) =>
  (
    await app.inject({
      method: 'GET',
      url: `/api/movements/suggest-category?kind=${kind}&concept=${encodeURIComponent(concept)}`,
    })
  ).json<CategorySuggestionDto>();

beforeEach(async () => {
  handle = openDatabase(':memory:');
  app = buildApp({ db: handle.db });
  food = await category('Supermercado', 'expense');
  eatingOut = await category('Restaurantes', 'expense');
  pay = await category('Nómina', 'income');
});

afterEach(async () => {
  await app.close();
  handle.close();
});

describe('GET /api/movements/suggest-category', () => {
  it('suggests the most used category for similar concepts, ignoring accents and case', async () => {
    await add('2026-01-05', 'expense', food, 'Mercadona Centro');
    await add('2026-01-12', 'expense', food, 'MERCADONA 123');
    await add('2026-01-20', 'expense', eatingOut, 'Mercadona Bar');
    expect(await suggest('expense', 'mercadoná')).toEqual({ categoryId: food });
    expect(await suggest('expense', 'Mercadona sur')).toEqual({ categoryId: food });
  });

  it('answers null when nothing is similar', async () => {
    await add('2026-01-05', 'expense', food, 'Mercadona');
    expect(await suggest('expense', 'Gasolina')).toEqual({ categoryId: null });
    expect(await suggest('expense', '')).toEqual({ categoryId: null });
  });

  it('only looks at movements of the same kind', async () => {
    await add('2026-01-05', 'expense', food, 'Paga extra');
    await add('2026-01-06', 'income', pay, 'Paga extra');
    expect(await suggest('income', 'Paga extra')).toEqual({ categoryId: pay });
    expect(await suggest('expense', 'Paga extra')).toEqual({ categoryId: food });
  });

  it('ignores movements in the trash', async () => {
    await add('2026-01-05', 'expense', food, 'Cena Luigi');
    const trashed = await add('2026-01-10', 'expense', eatingOut, 'Cena Luigi');
    await add('2026-01-11', 'expense', eatingOut, 'Cena Luigi extra');
    expect(await suggest('expense', 'Cena Luigi')).toEqual({ categoryId: eatingOut });
    await app.inject({ method: 'DELETE', url: `/api/movements/${String(trashed)}` });
    // One tie broken by recency is gone: the live exact match wins.
    expect(await suggest('expense', 'Cena Luigi')).toEqual({ categoryId: food });
  });

  it('rejects a repayment kind, a missing kind and a missing concept', async () => {
    for (const url of [
      '/api/movements/suggest-category?kind=repayment&concept=x',
      '/api/movements/suggest-category?concept=x',
      '/api/movements/suggest-category?kind=expense',
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(400);
    }
  });
});
