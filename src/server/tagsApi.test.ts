import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MovementDto, MovementSearchDto, TagDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';

// Plan 0002, task 04: tags on movements, tag management and the tag filter. Invented data.

let handle: DbHandle;
let app: FastifyInstance;
let food: number;

beforeEach(async () => {
  handle = openDatabase(':memory:');
  app = buildApp({ db: handle.db });
  food = (
    await app.inject({
      method: 'POST',
      url: '/api/categories',
      payload: { name: 'Supermercado', kind: 'expense' },
    })
  ).json<{ id: number }>().id;
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const add = async (concept: string, tags?: string[], date = '2026-02-10') => {
  const response = await app.inject({
    method: 'POST',
    url: '/api/movements',
    payload: {
      date,
      kind: 'expense',
      categoryId: food,
      concept,
      amountCents: 1_000,
      ...(tags === undefined ? {} : { tags }),
    },
  });
  expect(response.statusCode).toBe(201);
  return response.json<MovementDto>();
};
const tagList = async () =>
  (await app.inject({ method: 'GET', url: '/api/tags' })).json<TagDto[]>();
const searchTags = async (ids: string) =>
  (
    await app.inject({ method: 'GET', url: `/api/movements/search?tagIds=${ids}` })
  ).json<MovementSearchDto>();
const concepts = (r: MovementSearchDto) => r.rows.map((m) => m.concept).sort();

describe('tags on movements', () => {
  it('creates tags on the fly, case-insensitively and trimmed, and returns them sorted', async () => {
    const first = await add('Cine', ['Viaje', ' casa ']);
    expect(first.tags).toEqual(['casa', 'Viaje']);
    const second = await add('Hotel', ['VIAJE', 'viaje', 'Extra']);
    expect(second.tags).toEqual(['Extra', 'Viaje']);
    const all = await tagList();
    expect(all.map((t) => [t.name, t.movements])).toEqual([
      ['casa', 1],
      ['Extra', 1],
      ['Viaje', 2],
    ]);
  });

  it('has no tags unless given, and the month list carries them', async () => {
    const plain = await add('Pan');
    expect(plain.tags).toEqual([]);
    await add('Hotel', ['viaje']);
    const month = (await app.inject({ method: 'GET', url: '/api/movements?month=2026-02' })).json<
      MovementDto[]
    >();
    expect(Object.fromEntries(month.map((m) => [m.concept, m.tags]))).toEqual({
      Pan: [],
      Hotel: ['viaje'],
    });
  });

  it('replaces tags on update, keeps them when omitted and clears them with []', async () => {
    const m = await add('Hotel', ['viaje', 'casa']);
    const patch = (payload: object) =>
      app.inject({ method: 'PATCH', url: `/api/movements/${String(m.id)}`, payload });
    expect((await patch({ concept: 'Hotel 2' })).json<MovementDto>().tags).toEqual([
      'casa',
      'viaje',
    ]);
    expect((await patch({ tags: ['viaje'] })).json<MovementDto>().tags).toEqual(['viaje']);
    expect((await patch({ tags: [] })).json<MovementDto>().tags).toEqual([]);
  });

  it('rejects blank, too long and too many tags', async () => {
    const post = (tags: string[]) =>
      app.inject({
        method: 'POST',
        url: '/api/movements',
        payload: {
          date: '2026-02-10',
          kind: 'expense',
          categoryId: food,
          concept: 'X',
          amountCents: 100,
          tags,
        },
      });
    expect((await post([' '])).statusCode).toBe(400);
    expect((await post(['x'.repeat(31)])).statusCode).toBe(400);
    expect((await post(Array.from({ length: 11 }, (_, i) => `t${String(i)}`))).statusCode).toBe(
      400,
    );
    expect(await tagList()).toEqual([]);
  });
});

describe('tag management', () => {
  it('renames a tag, also changing its case, and refuses an existing name', async () => {
    const m = await add('Hotel', ['viaje', 'casa']);
    const [casa, viaje] = await tagList();
    const rename = (id: number | undefined, name: string) =>
      app.inject({ method: 'PATCH', url: `/api/tags/${String(id)}`, payload: { name } });

    expect((await rename(viaje?.id, 'Viaje')).statusCode).toBe(200);
    expect((await rename(viaje?.id, '  CASA ')).statusCode).toBe(409);
    expect((await rename(casa?.id, 'Hogar')).json<TagDto>().name).toBe('Hogar');
    expect((await rename(casa?.id, ' ')).statusCode).toBe(400);
    expect((await rename(999, 'Otra')).statusCode).toBe(404);

    const after = (await app.inject({ method: 'GET', url: '/api/movements?month=2026-02' })).json<
      MovementDto[]
    >();
    expect(after.find((x) => x.id === m.id)?.tags).toEqual(['Hogar', 'Viaje']);
    // The new name is taken for new movements too.
    expect((await add('Otro', ['hogar'])).tags).toEqual(['Hogar']);
  });

  it('deleting a tag removes only the links, never movements', async () => {
    await add('Hotel', ['viaje', 'casa']);
    await add('Vuelo', ['viaje']);
    const viaje = (await tagList()).find((t) => t.name === 'viaje');
    const response = await app.inject({ method: 'DELETE', url: `/api/tags/${String(viaje?.id)}` });
    expect(response.statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: '/api/tags/999' })).statusCode).toBe(404);

    const month = (await app.inject({ method: 'GET', url: '/api/movements?month=2026-02' })).json<
      MovementDto[]
    >();
    expect(month.map((m) => [m.concept, m.tags]).sort()).toEqual([
      ['Hotel', ['casa']],
      ['Vuelo', []],
    ]);
  });

  it('deleting a movement removes its links and keeps the tags', async () => {
    const m = await add('Hotel', ['viaje']);
    await app.inject({ method: 'DELETE', url: `/api/movements/${String(m.id)}` });
    expect((await tagList()).map((t) => [t.name, t.movements])).toEqual([['viaje', 0]]);
  });
});

describe('tag filter in the search', () => {
  it('requires every selected tag, ignores unknown ones and keeps other filters', async () => {
    await add('Hotel', ['viaje', 'casa'], '2026-02-10');
    await add('Vuelo', ['viaje'], '2026-03-10');
    await add('Pan', undefined, '2026-03-11');
    const [casa, viaje] = await tagList();
    const ids = (...tags: (TagDto | undefined)[]) => tags.map((t) => String(t?.id)).join(',');

    expect(concepts(await searchTags(ids(viaje)))).toEqual(['Hotel', 'Vuelo']);
    expect(concepts(await searchTags(ids(viaje, casa)))).toEqual(['Hotel']);
    // An unknown tag id is ignored; with only unknown ids there is no tag filter.
    expect(concepts(await searchTags(`${ids(casa)},999`))).toEqual(['Hotel']);
    expect(concepts(await searchTags('999'))).toEqual(['Hotel', 'Pan', 'Vuelo']);

    const combined = (
      await app.inject({
        method: 'GET',
        url: `/api/movements/search?tagIds=${ids(viaje)}&from=2026-03-01`,
      })
    ).json<MovementSearchDto>();
    expect(concepts(combined)).toEqual(['Vuelo']);
    expect(combined.rows[0]?.tags).toEqual(['viaje']);
    expect(combined.count).toBe(1);
  });

  it('refuses malformed tag lists', async () => {
    for (const bad of ['abc', '1,,2', '0', '-1', '1;2']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/movements/search?tagIds=${encodeURIComponent(bad)}`,
      });
      expect(response.statusCode, bad).toBe(400);
    }
    const empty = await app.inject({ method: 'GET', url: '/api/movements/search?tagIds=' });
    expect(empty.statusCode).toBe(200);
  });
});
