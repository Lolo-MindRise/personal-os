import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccountDto, CategoryDto, MovementDto, RecurringItemDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

let handle: DbHandle;
let app: FastifyInstance;

beforeEach(() => {
  handle = openDatabase(':memory:');
  seed(handle.db); // Principal (migration) and Efectivo (seed)
  app = buildApp({ db: handle.db });
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const get = (url: string) => app.inject({ method: 'GET', url });
const send = (method: 'POST' | 'PATCH', url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });

const validAccount = {
  name: 'Ahorro ficticio',
  type: 'savings',
  openingBalanceCents: 100_000,
  openingBalanceDate: '2026-01-01',
};

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

describe('accounts API', () => {
  it('lists Principal first, then the others', async () => {
    const response = await get('/api/accounts');
    expect(response.statusCode).toBe(200);
    const list = response.json<AccountDto[]>();
    expect(list.map((a) => a.name)).toEqual(['Principal', 'Efectivo']);
    expect(list[0]).toMatchObject({ id: 1, type: 'bank', openingBalanceCents: 0 });
  });

  it('creates an account, including a negative opening balance', async () => {
    const response = await send('POST', '/api/accounts', {
      ...validAccount,
      openingBalanceCents: -2_000,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<AccountDto>()).toMatchObject({
      name: 'Ahorro ficticio',
      type: 'savings',
      openingBalanceCents: -2_000,
      openingBalanceDate: '2026-01-01',
    });
  });

  it('rejects invalid data with field messages', async () => {
    for (const bad of [
      { ...validAccount, name: '  ' },
      { ...validAccount, type: 'credit' },
      { ...validAccount, openingBalanceCents: 1.5 },
      { ...validAccount, openingBalanceDate: '2026-02-30' },
      { ...validAccount, extra: 1 },
    ]) {
      const response = await send('POST', '/api/accounts', bad);
      expect(response.statusCode).toBe(400);
      expect(response.json<{ fields: object }>().fields).toBeDefined();
    }
  });

  it('keeps names unique ignoring case and spaces', async () => {
    const response = await send('POST', '/api/accounts', { ...validAccount, name: ' principal ' });
    expect(response.statusCode).toBe(409);
  });

  it('updates an account and rejects a name taken by another one', async () => {
    const created = (await send('POST', '/api/accounts', validAccount)).json<AccountDto>();
    const url = `/api/accounts/${String(created.id)}`;
    const ok = await send('PATCH', url, { name: 'Hucha', openingBalanceCents: 5 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<AccountDto>()).toMatchObject({ name: 'Hucha', openingBalanceCents: 5 });
    expect((await send('PATCH', url, { name: 'Efectivo' })).statusCode).toBe(409);
    expect((await send('PATCH', url, { type: 'nope' })).statusCode).toBe(400);
    // Keeping its own name is fine.
    expect((await send('PATCH', url, { name: 'Hucha' })).statusCode).toBe(200);
    expect((await send('PATCH', '/api/accounts/999', { name: 'x' })).statusCode).toBe(404);
  });

  it('refuses to delete Principal (deleting other accounts: transfersApi.test.ts)', async () => {
    const response = await app.inject({ method: 'DELETE', url: '/api/accounts/1' });
    expect(response.statusCode).toBe(409);
  });
});

describe('movements and accounts', () => {
  it('defaults a new movement to Principal and returns accountId', async () => {
    const response = await send('POST', '/api/movements', await validMovement());
    expect(response.statusCode).toBe(201);
    expect(response.json<MovementDto>().accountId).toBe(1);
  });

  it('accepts another account on create and on update', async () => {
    const accounts = (await get('/api/accounts')).json<AccountDto[]>();
    const cash = accounts.find((a) => a.name === 'Efectivo');
    expect(cash).toBeDefined();
    const created = await send('POST', '/api/movements', {
      ...(await validMovement()),
      accountId: cash?.id,
    });
    expect(created.statusCode).toBe(201);
    const movement = created.json<MovementDto>();
    expect(movement.accountId).toBe(cash?.id);
    const moved = await send('PATCH', `/api/movements/${String(movement.id)}`, { accountId: 1 });
    expect(moved.json<MovementDto>().accountId).toBe(1);
    // A patch that does not mention the account keeps it.
    const kept = await send('PATCH', `/api/movements/${String(movement.id)}`, { concept: 'Pera' });
    expect(kept.json<MovementDto>().accountId).toBe(1);
  });

  it('rejects an unknown account on create and on update', async () => {
    const created = await send('POST', '/api/movements', {
      ...(await validMovement()),
      accountId: 999,
    });
    expect(created.statusCode).toBe(400);
    expect(created.json<{ fields: Record<string, string> }>().fields).toHaveProperty('accountId');
    const ok = (await send('POST', '/api/movements', await validMovement())).json<MovementDto>();
    const patched = await send('PATCH', `/api/movements/${String(ok.id)}`, { accountId: 999 });
    expect(patched.statusCode).toBe(400);
    const zero = await send('POST', '/api/movements', { ...(await validMovement()), accountId: 0 });
    expect(zero.statusCode).toBe(400);
  });

  it('the seed puts Cine in Efectivo and everything else in Principal', async () => {
    const list = (await get('/api/movements?month=2026-01')).json<MovementDto[]>();
    const byAccount = new Map(list.map((m) => [m.concept, m.accountId]));
    expect(byAccount.get('Cine')).toBe(2);
    expect(byAccount.get('Nómina')).toBe(1);
  });
});

describe('confirming a fixed item with an account', () => {
  const confirm = async (concept: string, body?: unknown) => {
    const items = (await get('/api/recurring-items')).json<RecurringItemDto[]>();
    const item = items.find((i) => i.concept === concept);
    return send('POST', `/api/recurring-items/${String(item?.id)}/months/2026-01/confirm`, body);
  };

  it('defaults to Principal', async () => {
    const response = await confirm('Internet');
    expect(response.statusCode).toBe(201);
    expect(response.json<MovementDto>().accountId).toBe(1);
  });

  it('uses the chosen account', async () => {
    const response = await confirm('Gimnasio', { accountId: 2 });
    expect(response.statusCode).toBe(201);
    expect(response.json<MovementDto>().accountId).toBe(2);
  });

  it('rejects an unknown account and creates nothing', async () => {
    const response = await confirm('Electricidad', { accountId: 999 });
    expect(response.statusCode).toBe(400);
    const list = (await get('/api/movements?month=2026-01')).json<MovementDto[]>();
    expect(list.some((m) => m.concept === 'Electricidad')).toBe(false);
  });
});
