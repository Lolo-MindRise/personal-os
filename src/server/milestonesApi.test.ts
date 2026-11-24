import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MilestoneDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

let handle: DbHandle;
let app: FastifyInstance;

// Seed: "Revisar el presupuesto" (2026-02-15, done) and "Liquidar el préstamo"
// (2027-09-30, in_progress, with notes).
beforeEach(() => {
  handle = openDatabase(':memory:');
  seed(handle.db);
  app = buildApp({ db: handle.db });
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const list = async () =>
  (await app.inject({ method: 'GET', url: '/api/milestones' })).json<MilestoneDto[]>();
const send = (method: 'POST' | 'PATCH', url: string, payload: unknown) =>
  app.inject({ method, url, payload: payload as object });

describe('GET /api/milestones', () => {
  it('lists milestones ordered by target date', async () => {
    const rows = await list();
    expect(rows.map((r) => r.title)).toEqual(['Revisar el presupuesto', 'Liquidar el préstamo']);
    expect(rows[0]).toMatchObject({ targetDate: '2026-02-15', status: 'done', notes: null });
    expect(rows[1]).toMatchObject({ status: 'in_progress', notes: 'Fecha de ejemplo.' });
  });

  it('stays ordered after adding milestones in any order, equal dates by creation', async () => {
    await send('POST', '/api/milestones', { title: 'Tarde', targetDate: '2030-01-01' });
    await send('POST', '/api/milestones', { title: 'Pronto', targetDate: '2026-01-01' });
    await send('POST', '/api/milestones', { title: 'Empate A', targetDate: '2026-06-01' });
    await send('POST', '/api/milestones', { title: 'Empate B', targetDate: '2026-06-01' });
    expect((await list()).map((r) => r.title)).toEqual([
      'Pronto',
      'Revisar el presupuesto',
      'Empate A',
      'Empate B',
      'Liquidar el préstamo',
      'Tarde',
    ]);
  });
});

describe('POST /api/milestones', () => {
  it('creates a milestone, pending by default (201)', async () => {
    const response = await send('POST', '/api/milestones', {
      title: ' Abrir cuenta ',
      targetDate: '2026-12-01',
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<MilestoneDto>()).toMatchObject({
      title: 'Abrir cuenta',
      targetDate: '2026-12-01',
      status: 'pending',
      notes: null,
    });
  });

  it('accepts a status and notes', async () => {
    const response = await send('POST', '/api/milestones', {
      title: 'X',
      targetDate: '2026-12-01',
      status: 'in_progress',
      notes: 'Con notas',
    });
    expect(response.json<MilestoneDto>()).toMatchObject({
      status: 'in_progress',
      notes: 'Con notas',
    });
  });

  it.each([
    ['blank title', { title: '  ' }, 'title'],
    ['impossible date', { targetDate: '2026-02-30' }, 'targetDate'],
    ['unknown status', { status: 'cancelled' }, 'status'],
    ['missing date', { targetDate: undefined }, 'targetDate'],
    ['unknown field', { id: 4 }, '_'],
  ])('rejects %s with 400', async (_label, override, field) => {
    const body = { title: 'X', targetDate: '2026-12-01', ...override };
    const response = await send('POST', '/api/milestones', body);
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty(field);
    expect(await list()).toHaveLength(2);
  });
});

describe('PATCH /api/milestones/:id', () => {
  const idOf = async (title: string) => (await list()).find((m) => m.title === title)?.id ?? 0;

  it('changes the status only, keeping everything else', async () => {
    const id = await idOf('Liquidar el préstamo');
    const response = await send('PATCH', `/api/milestones/${String(id)}`, { status: 'done' });
    expect(response.statusCode).toBe(200);
    expect(response.json<MilestoneDto>()).toMatchObject({
      title: 'Liquidar el préstamo',
      targetDate: '2027-09-30',
      status: 'done',
      notes: 'Fecha de ejemplo.',
    });
  });

  it('edits title and date, which moves it in the order', async () => {
    const id = await idOf('Liquidar el préstamo');
    await send('PATCH', `/api/milestones/${String(id)}`, {
      title: 'Liquidar antes',
      targetDate: '2026-01-10',
    });
    expect((await list()).map((m) => m.title)).toEqual([
      'Liquidar antes',
      'Revisar el presupuesto',
    ]);
  });

  it('null clears the notes; leaving them out keeps them', async () => {
    const id = String(await idOf('Liquidar el préstamo'));
    await send('PATCH', `/api/milestones/${id}`, { title: 'Otro título' });
    expect((await list()).find((m) => m.title === 'Otro título')?.notes).toBe('Fecha de ejemplo.');
    await send('PATCH', `/api/milestones/${id}`, { notes: null });
    expect((await list()).find((m) => m.title === 'Otro título')?.notes).toBeNull();
  });

  it('rejects invalid values and unknown fields without changing anything', async () => {
    const id = String(await idOf('Liquidar el préstamo'));
    for (const body of [{ title: ' ' }, { status: 'x' }, { targetDate: 'mañana' }, { id: 9 }]) {
      expect((await send('PATCH', `/api/milestones/${id}`, body)).statusCode).toBe(400);
    }
    expect((await list()).find((m) => m.id === Number(id))).toMatchObject({
      title: 'Liquidar el préstamo',
      status: 'in_progress',
    });
  });

  it('accepts an empty body as a no-op, and 404s for unknown or malformed ids', async () => {
    const id = String(await idOf('Liquidar el préstamo'));
    expect((await send('PATCH', `/api/milestones/${id}`, {})).statusCode).toBe(200);
    expect((await send('PATCH', '/api/milestones/9999', { status: 'done' })).statusCode).toBe(404);
    expect((await send('PATCH', '/api/milestones/abc', { status: 'done' })).statusCode).toBe(404);
  });
});
