import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import type { TrashDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { exportData } from './dataExportApi.js';
import { openDatabase, type DbHandle } from './db/index.js';
import {
  accounts,
  appSettings,
  budgetLines,
  categories,
  debts,
  goals,
  milestones,
  movements,
  movementTags,
  recurringItems,
  recurringSkips,
  tags,
  transfers,
} from './db/schema.js';

// The trash (plan 0003, task 01): a trashed movement or transfer must be invisible everywhere.
// This is the required test: a table of every endpoint that returns a list, a total or a balance.
// Each response is compared (1) before and after trashing the rows and (2) against a database that
// never had them. If a reader forgets the exclusion, its row fails. Invented data only.

const TODAY = '2026-03-15';

interface Endpoint {
  name: string;
  method: 'GET' | 'POST';
  url: string;
  body?: object;
  /** The trashed rows change this response while they are live (proves the fixture reaches it). */
  affected: boolean;
}

/** Every endpoint returning a list, a total or a balance. The trash itself is tested apart. */
const ENDPOINTS: Endpoint[] = [
  {
    name: 'movements of the month',
    method: 'GET',
    url: '/api/movements?month=2026-03',
    affected: true,
  },
  {
    name: 'movements of another month',
    method: 'GET',
    url: '/api/movements?month=2026-02',
    affected: true,
  },
  { name: 'search: everything', method: 'GET', url: '/api/movements/search', affected: true },
  { name: 'search: text', method: 'GET', url: '/api/movements/search?q=extra', affected: true },
  {
    name: 'search: kind',
    method: 'GET',
    url: '/api/movements/search?kind=repayment',
    affected: true,
  },
  {
    name: 'search: category',
    method: 'GET',
    url: '/api/movements/search?categoryId=1',
    affected: true,
  },
  {
    name: 'search: amount range',
    method: 'GET',
    url: '/api/movements/search?minAmountCents=7000&maxAmountCents=8000',
    affected: true,
  },
  {
    name: 'search: tag filter',
    method: 'GET',
    url: '/api/movements/search?tagIds=1',
    affected: true,
  },
  { name: 'search: debt', method: 'GET', url: '/api/movements/search?debtId=1', affected: true },
  {
    name: 'search: fixed item',
    method: 'GET',
    url: '/api/movements/search?recurringItemId=2',
    affected: true,
  },
  { name: 'month summary', method: 'GET', url: '/api/months/2026-03/summary', affected: true },
  {
    name: 'month summary, previous month',
    method: 'GET',
    url: '/api/months/2026-02/summary',
    affected: true,
  },
  { name: 'budget', method: 'GET', url: '/api/months/2026-03/budget', affected: true },
  {
    name: 'pending fixed items',
    method: 'GET',
    url: '/api/months/2026-03/pending',
    affected: true,
  },
  {
    name: 'skipped fixed items',
    method: 'GET',
    url: '/api/months/2026-03/skipped',
    affected: false,
  },
  { name: 'transfers', method: 'GET', url: '/api/transfers', affected: true },
  { name: 'account balances', method: 'GET', url: '/api/accounts/balances', affected: true },
  { name: 'accounts', method: 'GET', url: '/api/accounts', affected: false },
  {
    name: 'reconciliation preview (Principal)',
    method: 'GET',
    url: '/api/accounts/1/reconciliation-preview?date=2026-03-31',
    affected: true,
  },
  {
    name: 'reconciliation preview (Efectivo)',
    method: 'GET',
    url: '/api/accounts/2/reconciliation-preview?date=2026-03-31',
    affected: true,
  },
  { name: 'reconciliations', method: 'GET', url: '/api/reconciliations', affected: false },
  {
    name: 'dashboard (month)',
    method: 'GET',
    url: `/api/dashboard?month=2026-03&today=${TODAY}`,
    affected: true,
  },
  {
    name: 'dashboard (previous month)',
    method: 'GET',
    url: `/api/dashboard?month=2026-02&today=${TODAY}`,
    affected: true,
  },
  {
    name: 'expense report',
    method: 'GET',
    url: '/api/reports/expenses?month=2026-03&months=3',
    affected: true,
  },
  { name: 'debts', method: 'GET', url: '/api/debts', affected: true },
  { name: 'year summary', method: 'GET', url: '/api/years/2026/summary', affected: true },
  { name: 'goals', method: 'GET', url: `/api/goals?today=${TODAY}`, affected: true },
  {
    name: 'projection',
    method: 'GET',
    url: `/api/projection?to=2026-06&today=${TODAY}`,
    affected: true,
  },
  { name: 'tags with counts', method: 'GET', url: '/api/tags', affected: true },
  { name: 'categories with usage', method: 'GET', url: '/api/categories/usage', affected: true },
  { name: 'categories', method: 'GET', url: '/api/categories', affected: false },
  { name: 'fixed items', method: 'GET', url: '/api/recurring-items', affected: false },
  { name: 'milestones', method: 'GET', url: '/api/milestones', affected: false },
  { name: 'settings', method: 'GET', url: '/api/settings', affected: false },
  {
    name: 'CSV import preview (duplicate check)',
    method: 'POST',
    url: '/api/import/preview',
    body: {
      rows: [
        { date: '2026-03-10', concept: 'Compra extra', amountCents: -7777 },
        { date: '2026-03-11', concept: 'Préstamo extra', amountCents: -12345 },
      ],
    },
    affected: true,
  },
];

interface Fixture {
  handle: DbHandle;
  app: FastifyInstance;
  trashedMovementIds: number[];
  trashedTransferIds: number[];
}

const open: Fixture[] = [];
afterEach(async () => {
  for (const f of open.splice(0)) {
    await f.app.close();
    f.handle.close();
  }
});

/**
 * The live data, plus (when `withExtras`) rows added LAST so the ids of the live rows are the same
 * in both databases: an expense with a marca already used, a repayment of a debt, the confirmation
 * of a debt installment, an income, and a transfer.
 */
function build(withExtras: boolean): Fixture {
  const handle = openDatabase(':memory:');
  const { db } = handle;
  db.insert(accounts)
    .values({
      id: 2,
      name: 'Efectivo',
      type: 'cash',
      openingBalanceCents: 5_000,
      openingBalanceDate: '2026-01-01',
    })
    .run();
  db.insert(categories)
    .values([
      { id: 1, name: 'Comida', kind: 'expense' },
      { id: 2, name: 'Vivienda', kind: 'expense' },
      { id: 3, name: 'Nómina', kind: 'income' },
      { id: 4, name: 'Deudas', kind: 'repayment' },
    ])
    .run();
  db.insert(debts)
    .values({
      id: 1,
      name: 'Préstamo coche',
      monthlyPaymentCents: 20_000,
      balanceCents: 500_000,
      balanceAsOf: '2026-01-31',
      remainingInstallments: 25,
      annualRateBps: 600,
    })
    .run();
  db.insert(recurringItems)
    .values([
      {
        id: 1,
        kind: 'expense',
        categoryId: 2,
        concept: 'Alquiler',
        amountCents: 60_000,
        expectedDay: 1,
        startMonth: '2026-01',
      },
      {
        id: 2,
        kind: 'repayment',
        categoryId: 4,
        concept: 'Cuota préstamo',
        amountCents: 20_000,
        expectedDay: 5,
        startMonth: '2026-01',
        debtId: 1,
      },
      {
        id: 3,
        kind: 'expense',
        categoryId: 1,
        concept: 'Suscripción',
        amountCents: 999,
        expectedDay: 20,
        startMonth: '2026-01',
      },
    ])
    .run();
  db.insert(recurringSkips).values({ recurringItemId: 3, month: '2026-02' }).run();
  db.insert(budgetLines)
    .values([
      { categoryId: 1, amountCents: 30_000, validFrom: '2026-01' },
      { categoryId: 2, amountCents: 60_000, validFrom: '2026-01' },
    ])
    .run();
  db.insert(goals)
    .values({ name: 'Fondo', targetAmountCents: 100_000, targetDate: '2026-12-31' })
    .run();
  db.insert(milestones).values({ title: 'Revisar seguro', targetDate: '2026-03-25' }).run();
  db.insert(appSettings)
    .values({ id: 1, initialSavingsCents: 10_000, initialSavingsDate: '2026-01-01' })
    .run();
  db.insert(tags).values({ id: 1, name: 'Viaje', nameKey: 'viaje' }).run();

  // Live movements.
  db.insert(movements)
    .values([
      {
        id: 1,
        date: '2026-03-02',
        kind: 'income',
        categoryId: 3,
        concept: 'Nómina marzo',
        amountCents: 200_000,
        accountId: 1,
      },
      {
        id: 2,
        date: '2026-03-03',
        kind: 'expense',
        categoryId: 1,
        concept: 'Compra semanal',
        amountCents: 8_500,
        accountId: 1,
      },
      {
        id: 3,
        date: '2026-03-01',
        kind: 'expense',
        categoryId: 2,
        concept: 'Alquiler',
        amountCents: 60_000,
        accountId: 1,
        recurringItemId: 1,
      },
      {
        id: 4,
        date: '2026-02-10',
        kind: 'expense',
        categoryId: 1,
        concept: 'Cena',
        amountCents: 4_000,
        accountId: 2,
      },
      {
        id: 5,
        date: '2026-02-05',
        kind: 'repayment',
        categoryId: 4,
        concept: 'Cuota préstamo',
        amountCents: 20_000,
        accountId: 1,
        recurringItemId: 2,
      },
      {
        id: 6,
        date: '2026-03-09',
        kind: 'repayment',
        categoryId: 4,
        concept: 'Amortización',
        amountCents: 5_000,
        accountId: 1,
        debtId: 1,
      },
    ])
    .run();
  db.insert(movementTags).values({ movementId: 4, tagId: 1 }).run();
  db.insert(transfers)
    .values({ id: 1, date: '2026-03-04', amountCents: 1_500, fromAccountId: 1, toAccountId: 2 })
    .run();

  const trashedMovementIds: number[] = [];
  const trashedTransferIds: number[] = [];
  if (withExtras) {
    const extras = db
      .insert(movements)
      .values([
        // Expense in a category with a budget, carrying a marca that live movements also use.
        {
          id: 7,
          date: '2026-03-10',
          kind: 'expense',
          categoryId: 1,
          concept: 'Compra extra',
          amountCents: 7_777,
          accountId: 2,
        },
        // An extra repayment of the debt.
        {
          id: 8,
          date: '2026-03-11',
          kind: 'repayment',
          categoryId: 4,
          concept: 'Préstamo extra',
          amountCents: 12_345,
          accountId: 1,
          debtId: 1,
        },
        // The confirmation of the debt installment of March (so it would not be pending).
        {
          id: 9,
          date: '2026-03-05',
          kind: 'repayment',
          categoryId: 4,
          concept: 'Cuota préstamo',
          amountCents: 20_000,
          accountId: 1,
          recurringItemId: 2,
        },
        // Income and an old expense, in the previous month (previous-month figures, accumulated).
        {
          id: 10,
          date: '2026-02-20',
          kind: 'income',
          categoryId: 3,
          concept: 'Extra ingreso',
          amountCents: 33_333,
          accountId: 1,
        },
        {
          id: 11,
          date: '2026-02-21',
          kind: 'expense',
          categoryId: 1,
          concept: 'Compra extra vieja',
          amountCents: 1_111,
          accountId: 1,
        },
      ])
      .returning({ id: movements.id })
      .all();
    trashedMovementIds.push(...extras.map((r) => r.id));
    db.insert(movementTags).values({ movementId: 7, tagId: 1 }).run();
    const moved = db
      .insert(transfers)
      .values({ date: '2026-03-12', amountCents: 9_999, fromAccountId: 2, toAccountId: 1 })
      .returning({ id: transfers.id })
      .all();
    trashedTransferIds.push(...moved.map((r) => r.id));
  }
  const app = buildApp({ db });
  const fixture = { handle, app, trashedMovementIds, trashedTransferIds };
  open.push(fixture);
  return fixture;
}

async function capture(
  app: FastifyInstance,
): Promise<Map<string, { status: number; body: unknown }>> {
  const result = new Map<string, { status: number; body: unknown }>();
  for (const e of ENDPOINTS) {
    const response = await app.inject({
      method: e.method,
      url: e.url,
      ...(e.body === undefined ? {} : { payload: e.body }),
    });
    result.set(e.name, {
      status: response.statusCode,
      body: withoutHeldFlag(response.json<unknown>()),
    });
  }
  return result;
}

/**
 * heldByTrash is the one deliberate trace of the trash on pending entries (it tells the UI the
 * item cannot be confirmed): it is compared apart in trashApi.test.ts, not here.
 */
function withoutHeldFlag(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutHeldFlag);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'heldByTrash')
        .map(([key, inner]) => [key, withoutHeldFlag(inner)]),
    );
  }
  return value;
}

async function trashExtras(f: Fixture): Promise<void> {
  for (const id of f.trashedMovementIds) {
    expect(
      (await f.app.inject({ method: 'DELETE', url: `/api/movements/${String(id)}` })).statusCode,
    ).toBe(204);
  }
  for (const id of f.trashedTransferIds) {
    expect(
      (await f.app.inject({ method: 'DELETE', url: `/api/transfers/${String(id)}` })).statusCode,
    ).toBe(204);
  }
}

describe('trash: invisible everywhere', () => {
  it('has unique endpoints that all answer 200', async () => {
    expect(new Set(ENDPOINTS.map((e) => e.name)).size).toBe(ENDPOINTS.length);
    const { app } = build(false);
    for (const [name, answer] of await capture(app)) {
      expect(answer.status, name).toBe(200);
    }
  });

  it.each(ENDPOINTS.map((e) => [e.name, e] as const))(
    '%s: same before the rows, after trashing them, and without them ever',
    async (_name, endpoint) => {
      const never = await capture(build(false).app);
      const withRows = build(true);
      const live = await capture(withRows.app);
      expect(withRows.trashedMovementIds.length).toBeGreaterThan(0);
      expect(withRows.trashedTransferIds.length).toBeGreaterThan(0);
      await trashExtras(withRows);
      const trashed = await capture(withRows.app);

      const reference = never.get(endpoint.name);
      expect(trashed.get(endpoint.name)).toEqual(reference);
      // The fixture reaches this endpoint: while live, the rows change its answer.
      if (endpoint.affected) {
        expect(live.get(endpoint.name), 'fixture does not reach this endpoint').not.toEqual(
          reference,
        );
      }
    },
  );

  it('keeps the rows: the trash lists them with their date, the export keeps them', async () => {
    const f = build(true);
    await trashExtras(f);
    const trash = (await f.app.inject({ method: 'GET', url: '/api/trash' })).json<TrashDto>();
    expect(trash.movements.map((m) => m.id).sort((a, b) => a - b)).toEqual(f.trashedMovementIds);
    expect(trash.transfers.map((t) => t.id)).toEqual(f.trashedTransferIds);
    expect(trash.movements.every((m) => /^\d{4}-\d\d-\d\dT/.test(m.deletedAt))).toBe(true);
    expect(trash.movements.find((m) => m.id === 7)?.tags).toEqual(['Viaje']);
    const file = exportData(f.handle.db);
    expect(file.tables.movements.filter((m) => m.deletedAt !== null)).toHaveLength(5);
    expect(file.tables.transfers.filter((t) => t.deletedAt !== null)).toHaveLength(1);
  });
});
