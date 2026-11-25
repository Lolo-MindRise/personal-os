import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountBalanceDto, AccountDto, CategoryDto, TransferDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

let handle: DbHandle;
let app: FastifyInstance;
let efectivo: AccountDto;

beforeEach(async () => {
  handle = openDatabase(':memory:');
  seed(handle.db); // Principal (id 1) and Efectivo
  app = buildApp({ db: handle.db });
  const accounts = (await get('/api/accounts')).json<AccountDto[]>();
  const found = accounts.find((a) => a.name === 'Efectivo');
  if (found === undefined) {
    throw new Error('seed account missing');
  }
  efectivo = found;
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const get = (url: string) => app.inject({ method: 'GET', url });
const send = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });

const transfer = (overrides: Record<string, unknown> = {}) => ({
  date: '2026-02-15',
  amountCents: 10_000,
  fromAccountId: 1,
  toAccountId: efectivo.id,
  ...overrides,
});

const balances = async () =>
  Object.fromEntries(
    (await get('/api/accounts/balances'))
      .json<AccountBalanceDto[]>()
      .map((b) => [b.accountId, b.balanceCents]),
  );

describe('transfers API', () => {
  it('creates, lists, updates and deletes a transfer', async () => {
    const created = await send('POST', '/api/transfers', transfer({ notes: 'Para gastos' }));
    expect(created.statusCode).toBe(201);
    const body = created.json<TransferDto>();
    expect(body).toMatchObject({
      date: '2026-02-15',
      amountCents: 10_000,
      fromAccountId: 1,
      toAccountId: efectivo.id,
      notes: 'Para gastos',
    });
    expect((await get('/api/transfers')).json<TransferDto[]>()).toEqual([body]);

    const patched = await send('PATCH', `/api/transfers/${String(body.id)}`, {
      amountCents: 2_500,
      notes: null,
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<TransferDto>()).toMatchObject({ amountCents: 2_500, notes: null });

    expect((await send('DELETE', `/api/transfers/${String(body.id)}`)).statusCode).toBe(204);
    expect((await get('/api/transfers')).json()).toEqual([]);
    expect((await send('DELETE', `/api/transfers/${String(body.id)}`)).statusCode).toBe(404);
  });

  it('lists newest first', async () => {
    await send('POST', '/api/transfers', transfer({ date: '2026-01-10' }));
    await send('POST', '/api/transfers', transfer({ date: '2026-03-10' }));
    const dates = (await get('/api/transfers')).json<TransferDto[]>().map((t) => t.date);
    expect(dates).toEqual(['2026-03-10', '2026-01-10']);
  });

  it('rejects invalid data', async () => {
    for (const bad of [
      transfer({ amountCents: 0 }),
      transfer({ amountCents: -5 }),
      transfer({ amountCents: 1.5 }),
      transfer({ date: '2026-02-30' }),
      transfer({ toAccountId: 1 }),
      transfer({ extra: true }),
    ]) {
      const response = await send('POST', '/api/transfers', bad);
      expect(response.statusCode, JSON.stringify(bad)).toBe(400);
    }
    const same = await send('POST', '/api/transfers', transfer({ toAccountId: 1 }));
    expect(same.json<{ fields: Record<string, string> }>().fields.toAccountId).toMatch(/distintas/);
  });

  it('rejects an unknown account', async () => {
    const response = await send('POST', '/api/transfers', transfer({ toAccountId: 999 }));
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields.toAccountId).toBeDefined();
    const origin = await send('POST', '/api/transfers', transfer({ fromAccountId: 999 }));
    expect(origin.json<{ fields: Record<string, string> }>().fields.fromAccountId).toBeDefined();
  });

  it('re-checks the merged accounts on update', async () => {
    const created = (await send('POST', '/api/transfers', transfer())).json<TransferDto>();
    const same = await send('PATCH', `/api/transfers/${String(created.id)}`, {
      toAccountId: 1,
    });
    expect(same.statusCode).toBe(400);
    const unknown = await send('PATCH', `/api/transfers/${String(created.id)}`, {
      fromAccountId: 999,
    });
    expect(unknown.statusCode).toBe(400);
    expect((await send('PATCH', '/api/transfers/999', { amountCents: 1 })).statusCode).toBe(404);
  });

  it('the database refuses a transfer to the same account or an unknown one', () => {
    const insert = (from: number, to: number) => () =>
      handle.sqlite
        .prepare(
          `INSERT INTO transfers (date, amount_cents, from_account_id, to_account_id)
           VALUES ('2026-02-15', 100, ?, ?)`,
        )
        .run(from, to);
    expect(insert(1, 1)).toThrow();
    expect(insert(1, 999)).toThrow();
  });
});

describe('account balances', () => {
  it('starts at the opening balance and follows transfers', async () => {
    const before = await balances();
    await send('POST', '/api/transfers', transfer());
    const after = await balances();
    expect(after[1]).toBe((before[1] ?? 0) - 10_000);
    expect(after[efectivo.id]).toBe((before[efectivo.id] ?? 0) + 10_000);
  });

  it('refuses a transfer dated on or before the opening date of either account', async () => {
    const before = await balances();
    const fields = (r: { json: () => unknown }) =>
      (r.json() as { fields: Record<string, string> }).fields;
    // Destination (Efectivo) and origin side.
    for (const body of [
      transfer({ date: efectivo.openingBalanceDate }),
      transfer({ date: '2000-01-01' }),
      transfer({ date: efectivo.openingBalanceDate, fromAccountId: efectivo.id, toAccountId: 1 }),
    ]) {
      const response = await send('POST', '/api/transfers', body);
      expect(response.statusCode).toBe(400);
      expect(fields(response).date).toMatch(/posterior a la fecha del saldo inicial de la cuenta/);
    }
    expect(await balances()).toEqual(before);
    expect((await get('/api/transfers')).json()).toEqual([]);
  });

  it('refuses moving an existing transfer to such a date, or to such an account', async () => {
    const created = (await send('POST', '/api/transfers', transfer())).json<TransferDto>();
    const url = `/api/transfers/${String(created.id)}`;
    const early = await send('PATCH', url, { date: efectivo.openingBalanceDate });
    expect(early.statusCode).toBe(400);
    expect(early.json<{ fields: Record<string, string> }>().fields.date).toBeDefined();
    // A new account opening later than the transfer date.
    const late = (
      await send('POST', '/api/accounts', {
        name: 'Tarjeta',
        type: 'bank',
        openingBalanceCents: 0,
        openingBalanceDate: '2026-06-01',
      })
    ).json<AccountDto>();
    const toLate = await send('PATCH', url, { toAccountId: late.id });
    expect(toLate.statusCode).toBe(400);
    expect(toLate.json<{ fields: Record<string, string> }>().fields.date).toBeDefined();
    expect((await get('/api/transfers')).json<TransferDto[]>()).toEqual([created]);
  });
});

describe('deleting an account', () => {
  const create = async (name: string) =>
    (
      await send('POST', '/api/accounts', {
        name,
        type: 'bank',
        openingBalanceCents: 0,
        openingBalanceDate: '2026-01-01',
      })
    ).json<AccountDto>();

  it('deletes an unused account', async () => {
    const account = await create('Vacía');
    expect((await send('DELETE', `/api/accounts/${String(account.id)}`)).statusCode).toBe(204);
    expect((await get('/api/accounts')).json<AccountDto[]>().map((a) => a.id)).not.toContain(
      account.id,
    );
  });

  it('refuses an account with transfers, either side', async () => {
    const a = await create('Origen');
    const b = await create('Destino');
    await send('POST', '/api/transfers', transfer({ fromAccountId: a.id, toAccountId: b.id }));
    for (const account of [a, b]) {
      const response = await send('DELETE', `/api/accounts/${String(account.id)}`);
      expect(response.statusCode).toBe(409);
    }
  });

  it('refuses an account with movements and Principal', async () => {
    // Efectivo holds the seeded "Cine" movement.
    expect((await send('DELETE', `/api/accounts/${String(efectivo.id)}`)).statusCode).toBe(409);
    expect((await send('DELETE', '/api/accounts/1')).statusCode).toBe(409);
    expect((await send('DELETE', '/api/accounts/999')).statusCode).toBe(404);
  });

  it('the database blocks deleting an account that has transfers', async () => {
    const a = await create('Origen');
    const b = await create('Destino');
    await send('POST', '/api/transfers', transfer({ fromAccountId: a.id, toAccountId: b.id }));
    expect(() => handle.sqlite.prepare('DELETE FROM accounts WHERE id = ?').run(a.id)).toThrow();
  });
});

describe('invariant: a transfer changes only the two balances', () => {
  const snapshot = async () => {
    const urls = [
      '/api/months/2026-02/summary',
      '/api/months/2026-02/budget',
      '/api/projection?to=2026-06&today=2026-02-20',
      '/api/dashboard?month=2026-02&today=2026-02-20',
      '/api/years/2026/summary',
      '/api/movements?month=2026-02',
    ];
    return Promise.all(urls.map(async (url) => [url, (await get(url)).json()] as const));
  };

  it('moves exactly 100 € between the balances and leaves every total unchanged', async () => {
    // Real activity first, so the totals are not empty.
    const categories = (await get('/api/categories')).json<CategoryDto[]>();
    const expense = categories.find((c) => c.kind === 'expense');
    expect(expense).toBeDefined();
    await send('POST', '/api/movements', {
      date: '2026-02-12',
      kind: 'expense',
      categoryId: expense?.id,
      concept: 'Compra',
      amountCents: 4_321,
    });

    const balancesBefore = await balances();
    const totalsBefore = await snapshot();

    // Mid-month, after both opening dates.
    const created = await send('POST', '/api/transfers', transfer({ date: '2026-02-18' }));
    expect(created.statusCode).toBe(201);

    const balancesAfter = await balances();
    expect((balancesAfter[1] ?? 0) - (balancesBefore[1] ?? 0)).toBe(-10_000);
    expect((balancesAfter[efectivo.id] ?? 0) - (balancesBefore[efectivo.id] ?? 0)).toBe(10_000);
    expect(await snapshot()).toEqual(totalsBefore);

    // Editing and deleting it also leaves them untouched.
    await send('PATCH', `/api/transfers/${String(created.json<TransferDto>().id)}`, {
      amountCents: 777,
    });
    expect(await snapshot()).toEqual(totalsBefore);
    await send('DELETE', `/api/transfers/${String(created.json<TransferDto>().id)}`);
    expect(await snapshot()).toEqual(totalsBefore);
    expect(await balances()).toEqual(balancesBefore);
  });
});
