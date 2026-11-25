import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ReconciliationDto, ReconciliationPreviewDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { categories, movements, reconciliations, transfers } from './db/schema.js';

// Plan 0003, task 06. Invented data. Principal (id 1) is made by the migration; account 2 is
// created here, opening 2026-01-31 with 50 000 cents.

let handle: DbHandle;
let app: FastifyInstance;

beforeEach(() => {
  handle = openDatabase(':memory:');
  const { db } = handle;
  db.insert(categories)
    .values([
      { id: 1, name: 'Nómina', kind: 'income' },
      { id: 2, name: 'Comida', kind: 'expense' },
    ])
    .run();
  handle.sqlite
    .prepare(
      "INSERT INTO accounts (id, name, type, opening_balance_cents, opening_balance_date) VALUES (2, 'Efectivo', 'cash', 50000, '2026-01-31')",
    )
    .run();
  db.insert(movements)
    .values([
      // on the opening date: not counted
      mv(1, '2026-01-31', 'income', 1, 9_999),
      mv(2, '2026-02-01', 'income', 1, 10_000),
      mv(3, '2026-02-10', 'expense', 2, 3_000),
      mv(4, '2026-02-20', 'expense', 2, 500),
    ])
    .run();
  db.insert(transfers)
    .values([
      { id: 1, date: '2026-02-05', amountCents: 4_000, fromAccountId: 2, toAccountId: 1 },
      { id: 2, date: '2026-02-06', amountCents: 700, fromAccountId: 1, toAccountId: 2 },
    ])
    .run();
  app = buildApp({ db });
});
afterEach(async () => {
  await app.close();
  handle.close();
});

function mv(
  id: number,
  date: string,
  kind: 'income' | 'expense',
  categoryId: number,
  cents: number,
) {
  return {
    id,
    date,
    kind,
    categoryId,
    concept: `Mov ${String(id)}`,
    amountCents: cents,
    accountId: 2,
  };
}

const preview = (date: string, account = 2) =>
  app.inject({
    method: 'GET',
    url: `/api/accounts/${String(account)}/reconciliation-preview?date=${date}`,
  });
const save = (payload: unknown, account = 2) =>
  app.inject({
    method: 'POST',
    url: `/api/accounts/${String(account)}/reconciliations`,
    payload: payload as object,
  });

describe('reconciliation preview', () => {
  it('gives the balance at the date and the movements and transfers up to it', async () => {
    const response = await preview('2026-02-10');
    expect(response.statusCode).toBe(200);
    const body = response.json<ReconciliationPreviewDto>();
    // 50 000 + 10 000 - 3 000 - 4 000 + 700
    expect(body.appBalanceCents).toBe(53_700);
    expect(body.last).toBeNull();
    expect(body.movements.map((m) => m.id)).toEqual([2, 3]);
    expect(body.transfers.map((t) => t.id)).toEqual([1, 2]);
  });

  it('is the opening balance on the opening date, with nothing listed', async () => {
    const body = (await preview('2026-01-31')).json<ReconciliationPreviewDto>();
    expect(body.appBalanceCents).toBe(50_000);
    expect(body.movements).toEqual([]);
    expect(body.transfers).toEqual([]);
  });

  it('refuses a date before the opening date and a bad date, and an unknown account', async () => {
    const early = await preview('2026-01-30');
    expect(early.statusCode).toBe(400);
    expect(early.json<{ error: string }>().error).toMatch(/anterior a la fecha del saldo inicial/);
    expect((await preview('2026-02-30')).statusCode).toBe(400);
    expect((await preview('nope')).statusCode).toBe(400);
    expect((await preview('2026-02-10', 99)).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/api/accounts/2/reconciliation-preview' }))
        .statusCode,
    ).toBe(400);
  });

  it('excludes deleted movements and transfers from the balance and the lists', async () => {
    expect((await app.inject({ method: 'DELETE', url: '/api/movements/3' })).statusCode).toBe(204);
    expect((await app.inject({ method: 'DELETE', url: '/api/transfers/1' })).statusCode).toBe(204);
    const body = (await preview('2026-02-10')).json<ReconciliationPreviewDto>();
    expect(body.appBalanceCents).toBe(50_000 + 10_000 + 700);
    expect(body.movements.map((m) => m.id)).toEqual([2]);
    expect(body.transfers.map((t) => t.id)).toEqual([2]);
  });

  it('writes nothing', async () => {
    await preview('2026-02-10');
    expect(handle.db.select().from(reconciliations).all()).toEqual([]);
  });
});

describe('saving a reconciliation', () => {
  it('stores the bank balance, the app balance and the signed difference', async () => {
    const response = await save({ date: '2026-02-10', bankBalanceCents: 54_700 });
    expect(response.statusCode).toBe(201);
    expect(response.json<ReconciliationDto>()).toMatchObject({
      accountId: 2,
      date: '2026-02-10',
      bankBalanceCents: 54_700,
      appBalanceCents: 53_700,
      differenceCents: 1_000,
    });
    const less = await save({ date: '2026-02-11', bankBalanceCents: 53_000 });
    expect(less.json<ReconciliationDto>().differenceCents).toBe(-700);
  });

  it('never changes the movements or the transfers', async () => {
    const before = [
      handle.db.select().from(movements).all(),
      handle.db.select().from(transfers).all(),
    ];
    await save({ date: '2026-02-10', bankBalanceCents: 1 });
    expect([
      handle.db.select().from(movements).all(),
      handle.db.select().from(transfers).all(),
    ]).toEqual(before);
  });

  it('lists the records, most recent first, and the next preview starts after the last one', async () => {
    await save({ date: '2026-02-05', bankBalanceCents: 54_000 });
    await save({ date: '2026-02-10', bankBalanceCents: 53_700 });
    const list = (await app.inject({ method: 'GET', url: '/api/reconciliations' })).json<
      ReconciliationDto[]
    >();
    expect(list.map((r) => r.date)).toEqual(['2026-02-10', '2026-02-05']);
    const body = (await preview('2026-02-28')).json<ReconciliationPreviewDto>();
    expect(body.last?.date).toBe('2026-02-10');
    expect(body.movements.map((m) => m.id)).toEqual([4]);
    expect(body.transfers).toEqual([]);
  });

  it('allows the opening date and refuses a date before it', async () => {
    expect((await save({ date: '2026-01-31', bankBalanceCents: 50_000 })).statusCode).toBe(201);
    const early = await save({ date: '2026-01-30', bankBalanceCents: 50_000 });
    expect(early.statusCode).toBe(400);
    expect(early.json<{ fields: Record<string, string> }>().fields.date).toMatch(/anterior/);
  });

  it('rejects invalid data and unknown accounts', async () => {
    for (const bad of [
      {},
      { date: '2026-02-10' },
      { date: '2026-02-10', bankBalanceCents: 1.5 },
      { date: '2026-02-10', bankBalanceCents: '100' },
      { date: '2026-02-30', bankBalanceCents: 100 },
      { date: '2026-02-10', bankBalanceCents: 100, differenceCents: 5 },
    ]) {
      expect((await save(bad)).statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect((await save({ date: '2026-02-10', bankBalanceCents: 1 }, 99)).statusCode).toBe(404);
    expect(handle.db.select().from(reconciliations).all()).toEqual([]);
  });

  it('accepts a negative bank balance', async () => {
    const response = await save({ date: '2026-02-10', bankBalanceCents: -2_000 });
    expect(response.json<ReconciliationDto>()).toMatchObject({
      bankBalanceCents: -2_000,
      differenceCents: -55_700,
    });
  });

  it('keeps the account deletable: its records go with it', async () => {
    await save({ date: '2026-01-31', bankBalanceCents: 50_000 });
    handle.sqlite.prepare('DELETE FROM movements').run();
    handle.sqlite.prepare('DELETE FROM transfers').run();
    expect((await app.inject({ method: 'DELETE', url: '/api/accounts/2' })).statusCode).toBe(204);
    expect(handle.db.select().from(reconciliations).all()).toEqual([]);
  });
});
