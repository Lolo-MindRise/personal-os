import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type {
  CategoryDto,
  CategoryRuleDto,
  ImportPreviewRowDto,
  ImportSummaryDto,
  MovementDto,
  PendingEntryDto,
  RecurringItemDto,
} from '../shared/api.js';
import type { ImportMapping } from '../shared/csvImport.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';

// Task 0013, block 2: rules, remembered mapping, preview and commit. Invented data only.

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

const call = (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });

async function category(name: string, kind: CategoryDto['kind']): Promise<number> {
  return (await call('POST', '/api/categories', { name, kind })).json<CategoryDto>().id;
}

const preview = async (rows: { date: string; concept: string; amountCents: number }[]) =>
  (await call('POST', '/api/import/preview', { rows })).json<{ rows: ImportPreviewRowDto[] }>()
    .rows;
const movementsOf = async (month: string) =>
  (await call('GET', `/api/movements?month=${month}`)).json<MovementDto[]>();

describe('category rules', () => {
  it('creates, lists in creation order and deletes rules', async () => {
    const food = await category('Supermercado', 'expense');
    const pay = await category('Nómina', 'income');
    const a = await call('POST', '/api/category-rules', {
      pattern: '  mercadona ',
      categoryId: food,
    });
    expect(a.statusCode).toBe(201);
    expect(a.json<CategoryRuleDto>()).toMatchObject({
      pattern: 'mercadona',
      categoryName: 'Supermercado',
      kind: 'expense',
    });
    await call('POST', '/api/category-rules', { pattern: 'nómina', categoryId: pay });
    const list = (await call('GET', '/api/category-rules')).json<CategoryRuleDto[]>();
    expect(list.map((r) => r.pattern)).toEqual(['mercadona', 'nómina']);

    const first = list[0]?.id ?? 0;
    expect((await call('DELETE', `/api/category-rules/${String(first)}`)).statusCode).toBe(204);
    expect((await call('DELETE', `/api/category-rules/${String(first)}`)).statusCode).toBe(404);
    expect((await call('GET', '/api/category-rules')).json<CategoryRuleDto[]>()).toHaveLength(1);
  });

  it('rejects an empty pattern, a missing category and a repeated pattern', async () => {
    const food = await category('Supermercado', 'expense');
    expect(
      (await call('POST', '/api/category-rules', { pattern: '  ', categoryId: food })).statusCode,
    ).toBe(400);
    const missing = await call('POST', '/api/category-rules', { pattern: 'x', categoryId: 999 });
    expect(missing.statusCode).toBe(400);
    await call('POST', '/api/category-rules', { pattern: 'Mercadona', categoryId: food });
    const repeated = await call('POST', '/api/category-rules', {
      pattern: 'MERCADONA ',
      categoryId: food,
    });
    expect(repeated.statusCode).toBe(409);
    expect(repeated.json<{ error: string }>().error).toMatch(/Ya existe una regla/);
  });

  it('deleting a category deletes its rules', async () => {
    const food = await category('Supermercado', 'expense');
    await call('POST', '/api/category-rules', { pattern: 'x', categoryId: food });
    expect((await call('DELETE', `/api/categories/${String(food)}`)).statusCode).toBe(204);
    expect((await call('GET', '/api/category-rules')).json<CategoryRuleDto[]>()).toEqual([]);
  });
});

describe('import mapping', () => {
  const mapping: ImportMapping = {
    hasHeader: true,
    dateColumn: 0,
    conceptColumn: 2,
    amountMode: 'split',
    amountColumn: null,
    debitColumn: 3,
    creditColumn: 4,
  };

  it('is null at first, then returns what was saved, and replaces it', async () => {
    expect((await call('GET', '/api/import/mapping')).json()).toEqual({ mapping: null });
    expect((await call('PUT', '/api/import/mapping', mapping)).statusCode).toBe(200);
    expect((await call('GET', '/api/import/mapping')).json()).toEqual({ mapping });
    const other = { ...mapping, hasHeader: false };
    await call('PUT', '/api/import/mapping', other);
    expect((await call('GET', '/api/import/mapping')).json()).toEqual({ mapping: other });
  });

  it('rejects an invalid mapping', async () => {
    const bad = await call('PUT', '/api/import/mapping', { ...mapping, dateColumn: -1 });
    expect(bad.statusCode).toBe(400);
    expect((await call('PUT', '/api/import/mapping', { hasHeader: true })).statusCode).toBe(400);
  });
});

describe('POST /api/import/preview', () => {
  it('applies rules, flags duplicates and proposes pending fixed items', async () => {
    const food = await category('Supermercado', 'expense');
    const housing = await category('Vivienda', 'expense');
    await call('POST', '/api/category-rules', { pattern: 'mercadona', categoryId: food });
    // An existing movement, and a fixed rent pending in February 2026.
    await call('POST', '/api/movements', {
      date: '2026-02-01',
      kind: 'expense',
      categoryId: food,
      concept: 'Compra Mercadona',
      amountCents: 2_550,
    });
    const item = (
      await call('POST', '/api/recurring-items', {
        kind: 'expense',
        categoryId: housing,
        concept: 'Alquiler',
        amountCents: 70_000,
        expectedDay: 5,
        startMonth: '2026-01',
      })
    ).json<RecurringItemDto>();

    const rows = await preview([
      { date: '2026-02-01', concept: 'COMPRA MERCADONA', amountCents: -2_550 }, // duplicate
      { date: '2026-02-03', concept: 'Mercadona 2', amountCents: -1_000 }, // rule
      { date: '2026-02-05', concept: 'RECIBO PISO', amountCents: -70_000 }, // fixed
      { date: '2026-02-06', concept: 'Algo raro', amountCents: -300 }, // nothing
    ]);
    expect(rows.map((r) => r.status)).toEqual(['duplicate', 'new', 'recurring', 'noCategory']);
    expect(rows[1]).toMatchObject({ categoryName: 'Supermercado', kind: 'expense' });
    expect(rows[2]).toMatchObject({
      recurringItemId: item.id,
      categoryName: 'Vivienda',
      concept: 'RECIBO PISO',
    });
  });

  it('does not propose a confirmed or skipped fixed item', async () => {
    const housing = await category('Vivienda', 'expense');
    const item = (
      await call('POST', '/api/recurring-items', {
        kind: 'expense',
        categoryId: housing,
        concept: 'Alquiler',
        amountCents: 70_000,
        expectedDay: 5,
        startMonth: '2026-01',
      })
    ).json<RecurringItemDto>();
    await call('POST', `/api/recurring-items/${String(item.id)}/months/2026-02/skip`);
    const [row] = await preview([{ date: '2026-02-05', concept: 'x', amountCents: -70_000 }]);
    expect(row?.status).toBe('noCategory');
  });

  it('flags a bank row for a fixed item already confirmed by hand, with the reason', async () => {
    const housing = await category('Vivienda', 'expense');
    const item = (
      await call('POST', '/api/recurring-items', {
        kind: 'expense',
        categoryId: housing,
        concept: 'Alquiler',
        amountCents: 70_000,
        expectedDay: 2,
        startMonth: '2026-01',
      })
    ).json<RecurringItemDto>();
    // Confirmed in Fijos on the item's own day (the 2nd) with its own concept.
    const confirmed = await call(
      'POST',
      `/api/recurring-items/${String(item.id)}/months/2026-02/confirm`,
      {},
    );
    expect(confirmed.statusCode).toBe(201);

    // The file only has a row on the 20th: the stored movement is before the file's first date.
    const rows = await preview([
      { date: '2026-02-20', concept: 'RECIBO PISO FEBRERO', amountCents: -70_000 },
      { date: '2026-03-20', concept: 'RECIBO PISO MARZO', amountCents: -70_000 },
    ]);
    expect(rows[0]).toMatchObject({
      status: 'duplicate',
      reason: 'ya confirmado como fijo',
      recurringItemId: null,
    });
    // March has no movement yet: its item is pending, so the row proposes confirming it.
    expect(rows[1]).toMatchObject({ status: 'recurring', recurringItemId: item.id, reason: null });
  });

  it('answers an empty list and validates the body', async () => {
    expect(await preview([])).toEqual([]);
    for (const bad of [
      [{ date: '2026-02-30', concept: 'x', amountCents: -1 }],
      [{ date: '2026-02-01', concept: ' ', amountCents: -1 }],
      [{ date: '2026-02-01', concept: 'x', amountCents: 0 }],
      [{ date: '2026-02-01', concept: 'x', amountCents: 1.5 }],
    ]) {
      expect((await call('POST', '/api/import/preview', { rows: bad })).statusCode).toBe(400);
    }
  });

  it('accepts the largest import and refuses one row more', async () => {
    const rows = Array.from({ length: 5_000 }, (_, i) => ({
      date: '2026-02-01',
      concept: `Concepto ${String(i)} con texto bastante largo para ocupar bytes`,
      amountCents: -(i + 1),
    }));
    const ok = await call('POST', '/api/import/preview', { rows });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ rows: unknown[] }>().rows).toHaveLength(5_000);
    const tooMany = await call('POST', '/api/import/preview', { rows: [...rows, rows[0]] });
    expect(tooMany.statusCode).toBe(400);
  });
});

describe('POST /api/import/commit', () => {
  it('creates movements and confirms fixed items in one go, with a summary', async () => {
    const food = await category('Supermercado', 'expense');
    const housing = await category('Vivienda', 'expense');
    const item = (
      await call('POST', '/api/recurring-items', {
        kind: 'expense',
        categoryId: housing,
        concept: 'Alquiler',
        amountCents: 70_000,
        expectedDay: 5,
        startMonth: '2026-01',
        notes: 'Contrato de ejemplo',
      })
    ).json<RecurringItemDto>();

    const response = await call('POST', '/api/import/commit', {
      rows: [
        {
          date: '2026-02-03',
          concept: 'MERCADONA',
          amountCents: 1_000,
          kind: 'expense',
          categoryId: food,
        },
        {
          date: '2026-02-04',
          concept: 'RECIBO PISO',
          amountCents: 70_000,
          kind: 'expense',
          categoryId: housing,
          recurringItemId: item.id,
        },
      ],
    });
    expect(response.statusCode).toBe(201);
    expect(response.json<ImportSummaryDto>()).toEqual({ created: 1, confirmedRecurring: 1 });

    const stored = await movementsOf('2026-02');
    expect(stored.map((m) => [m.concept, m.recurringItemId])).toEqual(
      expect.arrayContaining([
        ['MERCADONA', null],
        ['RECIBO PISO', item.id],
      ]),
    );
    // A confirmed fixed item carries the item's notes, as the normal confirmation does.
    expect(stored.find((m) => m.recurringItemId === item.id)?.notes).toBe('Contrato de ejemplo');
    // The fixed item is no longer pending, and importing the same file again finds duplicates.
    expect((await call('GET', '/api/months/2026-02/pending')).json<PendingEntryDto[]>()).toEqual(
      [],
    );
    const again = await preview([
      { date: '2026-02-03', concept: 'MERCADONA', amountCents: -1_000 },
      { date: '2026-02-04', concept: 'RECIBO PISO', amountCents: -70_000 },
    ]);
    expect(again.map((r) => r.status)).toEqual(['duplicate', 'duplicate']);
  });

  it('imports nothing when one row is wrong (single transaction)', async () => {
    const food = await category('Supermercado', 'expense');
    const pay = await category('Nómina', 'income');
    const response = await call('POST', '/api/import/commit', {
      rows: [
        {
          date: '2026-02-03',
          concept: 'bien',
          amountCents: 100,
          kind: 'expense',
          categoryId: food,
        },
        { date: '2026-02-03', concept: 'mal', amountCents: 100, kind: 'expense', categoryId: pay }, // kind mismatch
      ],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toMatch(/^Fila 2:/);
    expect(await movementsOf('2026-02')).toEqual([]);
  });

  it('rejects a fixed item confirmed twice in the same file, rolling everything back', async () => {
    const housing = await category('Vivienda', 'expense');
    const item = (
      await call('POST', '/api/recurring-items', {
        kind: 'expense',
        categoryId: housing,
        concept: 'Alquiler',
        amountCents: 1_000,
        expectedDay: 5,
        startMonth: '2026-01',
      })
    ).json<RecurringItemDto>();
    const row = {
      date: '2026-02-04',
      concept: 'RECIBO',
      amountCents: 1_000,
      kind: 'expense',
      categoryId: housing,
      recurringItemId: item.id,
    };
    const response = await call('POST', '/api/import/commit', {
      rows: [row, { ...row, concept: 'OTRO' }],
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ error: string }>().error).toMatch(/^Fila 2: el fijo ya está confirmado/);
    expect(await movementsOf('2026-02')).toEqual([]);
  });

  it('rejects a fixed item that does not fit the row: other kind, category, month or a skipped one', async () => {
    const housing = await category('Vivienda', 'expense');
    const other = await category('Ocio', 'expense');
    const item = (
      await call('POST', '/api/recurring-items', {
        kind: 'expense',
        categoryId: housing,
        concept: 'Alquiler',
        amountCents: 1_000,
        expectedDay: 5,
        startMonth: '2026-03',
      })
    ).json<RecurringItemDto>();
    const base = {
      date: '2026-03-04',
      concept: 'RECIBO',
      amountCents: 1_000,
      kind: 'expense',
      categoryId: housing,
      recurringItemId: item.id,
    };
    const attempts = [
      { ...base, categoryId: other }, // not the item's category
      { ...base, date: '2026-02-04' }, // before the start month
      { ...base, recurringItemId: 999 },
    ];
    for (const row of attempts) {
      expect((await call('POST', '/api/import/commit', { rows: [row] })).statusCode).toBe(400);
    }
    await call('POST', `/api/recurring-items/${String(item.id)}/months/2026-03/skip`);
    expect((await call('POST', '/api/import/commit', { rows: [base] })).statusCode).toBe(400);
    expect(await movementsOf('2026-03')).toEqual([]);
  });

  it('puts the rows in the chosen account, in Principal when none is given, refuses an unknown one', async () => {
    const food = await category('Supermercado', 'expense');
    const account = (
      await call('POST', '/api/accounts', {
        name: 'Ahorro ficticio',
        type: 'savings',
        openingBalanceCents: 0,
        openingBalanceDate: '2026-01-01',
      })
    ).json<{ id: number }>();
    const row = (concept: string) => ({
      date: '2026-02-03',
      concept,
      amountCents: 1_000,
      kind: 'expense',
      categoryId: food,
    });
    const accountOf = async (concept: string) =>
      (await movementsOf('2026-02')).find((m) => m.concept === concept)?.accountId;

    expect(
      (await call('POST', '/api/import/commit', { accountId: account.id, rows: [row('A')] }))
        .statusCode,
    ).toBe(201);
    expect(await accountOf('A')).toBe(account.id);

    expect((await call('POST', '/api/import/commit', { rows: [row('B')] })).statusCode).toBe(201);
    expect(await accountOf('B')).toBe(1);

    const unknown = await call('POST', '/api/import/commit', { accountId: 999, rows: [row('C')] });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json<{ fields: Record<string, string> }>().fields).toHaveProperty('accountId');
    expect(await accountOf('C')).toBeUndefined();
  });

  it('imports a row dated before the account opening date when asked to (the server enforces nothing)', async () => {
    const food = await category('Supermercado', 'expense');
    const response = await call('POST', '/api/import/commit', {
      rows: [
        {
          date: '2020-01-01',
          concept: 'Antigua',
          amountCents: 100,
          kind: 'expense',
          categoryId: food,
        },
      ],
    });
    expect(response.statusCode).toBe(201);
  });

  it('validates the body: empty list, zero or negative amounts, bad dates', async () => {
    const food = await category('Supermercado', 'expense');
    const row = {
      date: '2026-02-03',
      concept: 'x',
      amountCents: 100,
      kind: 'expense',
      categoryId: food,
    };
    expect((await call('POST', '/api/import/commit', { rows: [] })).statusCode).toBe(400);
    expect(
      (await call('POST', '/api/import/commit', { rows: [{ ...row, amountCents: -5 }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/api/import/commit', { rows: [{ ...row, date: '3/2/2026' }] }))
        .statusCode,
    ).toBe(400);
    expect(
      (await call('POST', '/api/import/commit', { rows: [{ ...row, kind: 'nope' }] })).statusCode,
    ).toBe(400);
  });
});
