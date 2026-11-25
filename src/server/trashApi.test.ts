import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  ApiErrorBody,
  CategoryDto,
  CategoryUsageDto,
  MovementDto,
  PendingEntryDto,
  RecurringItemDto,
  TagDto,
  TransferDto,
  TrashDto,
} from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { movements, transfers } from './db/schema.js';

// Trash behaviour (plan 0003, task 01): soft delete, list, restore, delete for good, and the
// interactions with fixed items, categories, accounts and transfers. Invented data only.

let handle: DbHandle;
let app: FastifyInstance;

beforeEach(() => {
  handle = openDatabase(':memory:');
  app = buildApp({ db: handle.db });
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload }) });

async function category(name: string, kind: 'income' | 'expense' | 'repayment' = 'expense') {
  return (await call('POST', '/api/categories', { name, kind })).json<CategoryDto>().id;
}
async function movement(categoryId: number, extra: object = {}): Promise<MovementDto> {
  const response = await call('POST', '/api/movements', {
    date: '2026-03-10',
    kind: 'expense',
    categoryId,
    concept: 'Compra',
    amountCents: 1_500,
    ...extra,
  });
  expect(response.statusCode).toBe(201);
  return response.json<MovementDto>();
}
const trash = async () => (await call('GET', '/api/trash')).json<TrashDto>();
const month = async (m: string) =>
  (await call('GET', `/api/movements?month=${m}`)).json<MovementDto[]>();
const rowCount = (table: typeof movements | typeof transfers) =>
  handle.db.select().from(table).all().length;

describe('deleting a movement', () => {
  it('moves it to the trash: the row stays, every list stops showing it', async () => {
    const food = await category('Comida');
    const m = await movement(food, { tags: ['viaje'] });
    expect((await call('DELETE', `/api/movements/${String(m.id)}`)).statusCode).toBe(204);

    expect(rowCount(movements)).toBe(1);
    expect(await month('2026-03')).toEqual([]);
    const listed = await trash();
    expect(listed.movements).toHaveLength(1);
    expect(listed.movements[0]).toMatchObject({ id: m.id, concept: 'Compra', tags: ['viaje'] });
    expect(listed.movements[0]?.deletedAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
    expect(listed.transfers).toEqual([]);
  });

  it('answers 404 for a movement already in the trash, and cannot edit it', async () => {
    const m = await movement(await category('Comida'));
    await call('DELETE', `/api/movements/${String(m.id)}`);
    expect((await call('DELETE', `/api/movements/${String(m.id)}`)).statusCode).toBe(404);
    expect(
      (await call('PATCH', `/api/movements/${String(m.id)}`, { concept: 'x' })).statusCode,
    ).toBe(404);
    expect((await trash()).movements).toHaveLength(1);
  });

  it('restores it, with its tags, exactly as it was', async () => {
    const m = await movement(await category('Comida'), { tags: ['Viaje'], notes: 'nota' });
    await call('DELETE', `/api/movements/${String(m.id)}`);
    const restored = await call('POST', `/api/trash/movements/${String(m.id)}/restore`);
    expect(restored.statusCode).toBe(200);
    expect(restored.json<MovementDto>()).toEqual(m);
    expect(await month('2026-03')).toEqual([m]);
    expect((await trash()).movements).toEqual([]);
    expect((await call('GET', '/api/tags')).json<TagDto[]>()[0]?.movements).toBe(1);
  });

  it('restoring a movement that is not in the trash is a 404', async () => {
    const m = await movement(await category('Comida'));
    expect((await call('POST', `/api/trash/movements/${String(m.id)}/restore`)).statusCode).toBe(
      404,
    );
    expect((await call('POST', '/api/trash/movements/999/restore')).statusCode).toBe(404);
  });

  it('deletes for good only what is in the trash, one row at a time', async () => {
    const food = await category('Comida');
    const live = await movement(food, { concept: 'Vivo' });
    const gone = await movement(food, { concept: 'Fuera', tags: ['a'] });
    await call('DELETE', `/api/movements/${String(gone.id)}`);

    // A live movement cannot be removed through the trash route.
    expect((await call('DELETE', `/api/trash/movements/${String(live.id)}`)).statusCode).toBe(404);
    expect(rowCount(movements)).toBe(2);

    expect((await call('DELETE', `/api/trash/movements/${String(gone.id)}`)).statusCode).toBe(204);
    expect(rowCount(movements)).toBe(1);
    expect((await call('DELETE', `/api/trash/movements/${String(gone.id)}`)).statusCode).toBe(404);
    expect(await month('2026-03')).toEqual([live]);
    // Its tag link went with it (cascade), the tag itself stays.
    expect((await call('GET', '/api/tags')).json<TagDto[]>()[0]?.movements).toBe(0);
  });

  it('keeps the newest deletion first and never removes anything by itself', async () => {
    const food = await category('Comida');
    const a = await movement(food, { concept: 'A' });
    const b = await movement(food, { concept: 'B' });
    await call('DELETE', `/api/movements/${String(a.id)}`);
    await call('DELETE', `/api/movements/${String(b.id)}`);
    expect((await trash()).movements.map((m) => m.concept)).toEqual(['B', 'A']);
    expect(rowCount(movements)).toBe(2);
  });
});

describe('deleting a transfer', () => {
  async function twoAccounts() {
    const created = await call('POST', '/api/accounts', {
      name: 'Efectivo',
      type: 'cash',
      openingBalanceCents: 0,
      openingBalanceDate: '2026-01-01',
    });
    return created.json<{ id: number }>().id;
  }
  const payload = (to: number) => ({
    date: '2026-03-04',
    amountCents: 2_000,
    fromAccountId: 1,
    toAccountId: to,
  });

  it('moves it to the trash, restores it, and deletes it for good', async () => {
    const cash = await twoAccounts();
    const t = (await call('POST', '/api/transfers', payload(cash))).json<TransferDto>();
    expect((await call('DELETE', `/api/transfers/${String(t.id)}`)).statusCode).toBe(204);
    expect(rowCount(transfers)).toBe(1);
    expect((await call('GET', '/api/transfers')).json<TransferDto[]>()).toEqual([]);
    expect(
      (await call('PATCH', `/api/transfers/${String(t.id)}`, { amountCents: 1 })).statusCode,
    ).toBe(404);
    expect((await call('DELETE', `/api/transfers/${String(t.id)}`)).statusCode).toBe(404);
    const listed = await trash();
    expect(listed.transfers).toHaveLength(1);
    expect(listed.transfers[0]).toMatchObject({ id: t.id, amountCents: 2_000 });

    const restored = await call('POST', `/api/trash/transfers/${String(t.id)}/restore`);
    expect(restored.statusCode).toBe(200);
    expect(restored.json<TransferDto>()).toEqual(t);
    expect((await call('GET', '/api/transfers')).json<TransferDto[]>()).toEqual([t]);

    // A live transfer is not removable for good; a trashed one is.
    expect((await call('DELETE', `/api/trash/transfers/${String(t.id)}`)).statusCode).toBe(404);
    await call('DELETE', `/api/transfers/${String(t.id)}`);
    expect((await call('DELETE', `/api/trash/transfers/${String(t.id)}`)).statusCode).toBe(204);
    expect(rowCount(transfers)).toBe(0);
  });

  it('keeps counting trashed rows as "in use" for deleting the account', async () => {
    const cash = await twoAccounts();
    const t = (await call('POST', '/api/transfers', payload(cash))).json<TransferDto>();
    await call('DELETE', `/api/transfers/${String(t.id)}`);
    expect((await call('DELETE', `/api/accounts/${String(cash)}`)).statusCode).toBe(409);
  });

  it('refuses to restore a transfer whose date no longer follows the opening dates', async () => {
    const cash = await twoAccounts();
    const t = (await call('POST', '/api/transfers', payload(cash))).json<TransferDto>();
    await call('DELETE', `/api/transfers/${String(t.id)}`);
    // The trashed transfer does not block moving the opening date after it.
    const moved = await call('PATCH', `/api/accounts/${String(cash)}`, {
      openingBalanceDate: '2026-03-20',
    });
    expect(moved.statusCode).toBe(200);
    const refused = await call('POST', `/api/trash/transfers/${String(t.id)}/restore`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<ApiErrorBody>().error).toMatch(/^No se puede restaurar/);
    expect((await trash()).transfers).toHaveLength(1);
    expect((await call('GET', '/api/transfers')).json<TransferDto[]>()).toEqual([]);
  });
});

describe('fixed items and the month slot', () => {
  async function fixedItem() {
    const rent = await category('Vivienda');
    const item = (
      await call('POST', '/api/recurring-items', {
        kind: 'expense',
        categoryId: rent,
        concept: 'Alquiler',
        amountCents: 60_000,
        expectedDay: 1,
        startMonth: '2026-01',
      })
    ).json<RecurringItemDto>();
    return { rent, item };
  }
  const confirm = (itemId: number) =>
    call('POST', `/api/recurring-items/${String(itemId)}/months/2026-03/confirm`);
  const pending = async () =>
    (await call('GET', '/api/months/2026-03/pending')).json<PendingEntryDto[]>();

  it('a trashed confirmed movement makes the fixed item pending again', async () => {
    const { item } = await fixedItem();
    const confirmed = (await confirm(item.id)).json<MovementDto>();
    expect(await pending()).toEqual([]);
    await call('DELETE', `/api/movements/${String(confirmed.id)}`);
    expect((await pending()).map((p) => p.recurringItemId)).toEqual([item.id]);
  });

  const HOLDS = /papelera: restáuralo o elimínalo definitivamente/;
  const importCommit = (itemId: number, rent: number) =>
    call('POST', '/api/import/commit', {
      rows: [
        {
          date: '2026-03-01',
          kind: 'expense',
          categoryId: rent,
          concept: 'Alquiler',
          amountCents: 60_000,
          recurringItemId: itemId,
        },
        {
          date: '2026-03-02',
          kind: 'expense',
          categoryId: rent,
          concept: 'Otro',
          amountCents: 100,
        },
      ],
    });

  it('order 1: while the old one is trashed, confirming again is refused (single, all, import)', async () => {
    const { rent, item } = await fixedItem();
    const first = (await confirm(item.id)).json<MovementDto>();
    await call('DELETE', `/api/movements/${String(first.id)}`);

    const single = await confirm(item.id);
    expect(single.statusCode).toBe(409);
    expect(single.json<ApiErrorBody>().error).toMatch(HOLDS);

    const all = await call('POST', '/api/months/2026-03/confirm-all');
    expect(all.statusCode).toBe(409);
    expect(all.json<ApiErrorBody>().error).toMatch(HOLDS);

    const imported = await importCommit(item.id, rent);
    expect(imported.statusCode).toBe(400);
    expect(imported.json<ApiErrorBody>().error).toMatch(HOLDS);

    // Nothing written by any of them: no live movement, not even the plain import row.
    expect(rowCount(movements)).toBe(1);
    expect(await month('2026-03')).toEqual([]);
    expect((await pending()).map((p) => p.recurringItemId)).toEqual([item.id]);

    // The restore is conflict-free and the item is confirmed again.
    expect(
      (await call('POST', `/api/trash/movements/${String(first.id)}/restore`)).statusCode,
    ).toBe(200);
    expect(await pending()).toEqual([]);
  });

  it('confirm-all does not fail halfway: nothing is written when one item is held', async () => {
    const { rent, item } = await fixedItem();
    const other = (
      await call('POST', '/api/recurring-items', {
        kind: 'expense',
        categoryId: rent,
        concept: 'Internet',
        amountCents: 3_000,
        expectedDay: 5,
        startMonth: '2026-01',
      })
    ).json<RecurringItemDto>();
    const first = (await confirm(item.id)).json<MovementDto>();
    await call('DELETE', `/api/movements/${String(first.id)}`);
    expect((await call('POST', '/api/months/2026-03/confirm-all')).statusCode).toBe(409);
    expect(rowCount(movements)).toBe(1);
    expect((await pending()).map((p) => p.recurringItemId).sort()).toEqual(
      [item.id, other.id].sort(),
    );
  });

  it('once the trashed one is deleted for good, confirming works again', async () => {
    const { item } = await fixedItem();
    const first = (await confirm(item.id)).json<MovementDto>();
    await call('DELETE', `/api/movements/${String(first.id)}`);
    await call('DELETE', `/api/trash/movements/${String(first.id)}`);
    expect((await confirm(item.id)).statusCode).toBe(201);
    expect(await pending()).toEqual([]);
  });

  it('import commit still confirms a fixed item with no trashed confirmation', async () => {
    const { rent, item } = await fixedItem();
    const ok = await importCommit(item.id, rent);
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toEqual({ created: 1, confirmedRecurring: 1 });
  });

  it('order 2: restore the old one first, then confirming again is refused as already confirmed', async () => {
    const { item } = await fixedItem();
    const first = (await confirm(item.id)).json<MovementDto>();
    await call('DELETE', `/api/movements/${String(first.id)}`);
    expect(
      (await call('POST', `/api/trash/movements/${String(first.id)}/restore`)).statusCode,
    ).toBe(200);
    expect(await pending()).toEqual([]);
    expect((await confirm(item.id)).statusCode).toBe(409);
    expect(await month('2026-03')).toHaveLength(1);
  });

  it('a skip made while the movement was in the trash blocks the restore', async () => {
    const { item } = await fixedItem();
    const first = (await confirm(item.id)).json<MovementDto>();
    await call('DELETE', `/api/movements/${String(first.id)}`);
    expect(
      (await call('POST', `/api/recurring-items/${String(item.id)}/months/2026-03/skip`))
        .statusCode,
    ).toBe(204);
    const refused = await call('POST', `/api/trash/movements/${String(first.id)}/restore`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<ApiErrorBody>().error).toMatch(/saltado/);
    expect((await trash()).movements).toHaveLength(1);
  });
});

describe('references of a trashed movement', () => {
  it('counts the trash as use of its category: it cannot be deleted, with a clear message', async () => {
    const food = await category('Comida');
    const m = await movement(food);
    await call('DELETE', `/api/movements/${String(m.id)}`);
    const usage = (await call('GET', '/api/categories/usage')).json<CategoryUsageDto[]>();
    expect(usage.find((c) => c.id === food)?.movements).toBe(0);
    const refused = await call('DELETE', `/api/categories/${String(food)}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<ApiErrorBody>().error).toMatch(/papelera/);
    // Once it is deleted for good, the category can go.
    await call('DELETE', `/api/trash/movements/${String(m.id)}`);
    expect((await call('DELETE', `/api/categories/${String(food)}`)).statusCode).toBe(204);
  });

  it('counts the trash as use of its account', async () => {
    const cash = (
      await call('POST', '/api/accounts', {
        name: 'Efectivo',
        type: 'cash',
        openingBalanceCents: 0,
        openingBalanceDate: '2026-01-01',
      })
    ).json<{ id: number }>().id;
    const m = await movement(await category('Comida'), { accountId: cash });
    await call('DELETE', `/api/movements/${String(m.id)}`);
    const refused = await call('DELETE', `/api/accounts/${String(cash)}`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<ApiErrorBody>().error).toMatch(/papelera/);
  });

  it('refuses to restore when its category is gone (damaged data), leaving it in the trash', async () => {
    const food = await category('Comida');
    const m = await movement(food);
    await call('DELETE', `/api/movements/${String(m.id)}`);
    // Only reachable by bypassing the application: foreign keys off, category removed.
    handle.sqlite.pragma('foreign_keys = OFF');
    handle.sqlite.prepare('DELETE FROM categories WHERE id = ?').run(food);
    handle.sqlite.pragma('foreign_keys = ON');
    const refused = await call('POST', `/api/trash/movements/${String(m.id)}/restore`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<ApiErrorBody>().error).toMatch(
      /^No se puede restaurar: la categoría no existe/,
    );
    expect(rowCount(movements)).toBe(1);
    expect(handle.sqlite.prepare('SELECT deleted_at FROM movements').get()).not.toEqual({
      deleted_at: null,
    });
  });

  it('refuses to restore a repayment whose debt is gone', async () => {
    const debtCategory = await category('Deudas', 'repayment');
    const debt = (
      await call('POST', '/api/debts', {
        name: 'Préstamo',
        monthlyPaymentCents: 10_000,
        balanceCents: 100_000,
        balanceAsOf: '2026-01-31',
        remainingInstallments: 10,
        annualRateBps: 0,
      })
    ).json<{ id: number }>();
    const m = await movement(debtCategory, { kind: 'repayment', debtId: debt.id });
    await call('DELETE', `/api/movements/${String(m.id)}`);
    handle.sqlite.pragma('foreign_keys = OFF');
    handle.sqlite.prepare('DELETE FROM debts WHERE id = ?').run(debt.id);
    handle.sqlite.pragma('foreign_keys = ON');
    const refused = await call('POST', `/api/trash/movements/${String(m.id)}/restore`);
    expect(refused.statusCode).toBe(409);
    expect(refused.json<ApiErrorBody>().error).toBe(
      'No se puede restaurar: la deuda ya no existe.',
    );
    expect((await trash()).movements).toHaveLength(1);
  });
});
