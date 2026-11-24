import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto, DebtDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

let handle: DbHandle;
let app: FastifyInstance;

beforeEach(() => {
  handle = openDatabase(':memory:');
  seed(handle.db); // one debt: balance 3.000,00 as of 2026-01-31, one linked repayment on 2026-01-25
  app = buildApp({ db: handle.db });
});
afterEach(async () => {
  await app.close();
  handle.close();
});

const list = async () => (await app.inject({ method: 'GET', url: '/api/debts' })).json<DebtDto[]>();
const send = (method: 'POST' | 'PATCH', url: string, payload: unknown) =>
  app.inject({ method, url, payload: payload as object });

const newDebt = {
  name: 'Tarjeta de ejemplo',
  monthlyPaymentCents: 5_000,
  balanceCents: 120_000,
  balanceAsOf: '2026-02-01',
  remainingInstallments: 24,
  annualRateBps: 1_999,
};

async function repaymentCategory(): Promise<number> {
  const all = (await app.inject({ method: 'GET', url: '/api/categories' })).json<CategoryDto[]>();
  return all.find((c) => c.kind === 'repayment')?.id ?? -1;
}

/** Links a new repayment movement to the debt. */
async function repay(debtId: number, date: string, amountCents: number, concept = 'Extra') {
  const response = await send('POST', '/api/movements', {
    date,
    kind: 'repayment',
    categoryId: await repaymentCategory(),
    concept,
    amountCents,
    debtId,
  });
  expect(response.statusCode).toBe(201);
}

describe('GET /api/debts', () => {
  it('lists debts with their data, linked repayments and estimated balance', async () => {
    const [debt] = await list();
    expect(debt).toMatchObject({
      name: 'Préstamo personal de ejemplo',
      monthlyPaymentCents: 15_000,
      balanceCents: 300_000,
      balanceAsOf: '2026-01-31',
      remainingInstallments: 20,
      annualRateBps: 650,
    });
    // The seeded repayment is dated before the as-of date: listed, but not deducted.
    expect(debt?.repayments).toHaveLength(1);
    expect(debt?.repayments[0]).toMatchObject({ date: '2026-01-25', amountCents: 10_000 });
    expect(debt?.repaidSinceCents).toBe(0);
    expect(debt?.estimatedBalanceCents).toBe(300_000);
  });

  it('deducts linked repayments dated after the as-of date, and only those', async () => {
    const [debt] = await list();
    await repay(debt?.id ?? 0, '2026-01-31', 7_777, 'Mismo día'); // same day: not after
    await repay(debt?.id ?? 0, '2026-02-10', 20_000);
    await repay(debt?.id ?? 0, '2026-03-05', 5_000);
    const [after] = await list();
    expect(after?.repayments.map((r) => r.date)).toEqual([
      '2026-03-05',
      '2026-02-10',
      '2026-01-31',
      '2026-01-25',
    ]);
    expect(after?.repaidSinceCents).toBe(25_000);
    expect(after?.estimatedBalanceCents).toBe(275_000);
  });

  it('ignores repayments linked to another debt or to none', async () => {
    const created = (await send('POST', '/api/debts', newDebt)).json<DebtDto>();
    await repay(created.id, '2026-03-01', 10_000);
    const [seeded, other] = (await list()).sort((a, b) => a.id - b.id);
    expect(seeded?.repaidSinceCents).toBe(0);
    expect(other?.repaidSinceCents).toBe(10_000);
    expect(other?.estimatedBalanceCents).toBe(110_000);
  });

  it('never estimates below zero', async () => {
    const [debt] = await list();
    await repay(debt?.id ?? 0, '2026-02-01', 400_000);
    expect((await list())[0]?.estimatedBalanceCents).toBe(0);
  });
});

describe('POST /api/debts', () => {
  it('creates a debt (201) with no repayments', async () => {
    const response = await send('POST', '/api/debts', { ...newDebt, notes: 'Ejemplo' });
    expect(response.statusCode).toBe(201);
    expect(response.json<DebtDto>()).toMatchObject({
      ...newDebt,
      notes: 'Ejemplo',
      repayments: [],
      estimatedBalanceCents: 120_000,
    });
    expect(await list()).toHaveLength(2);
  });

  it.each([
    ['blank name', { name: ' ' }, 'name'],
    ['zero payment', { monthlyPaymentCents: 0 }, 'monthlyPaymentCents'],
    ['float balance', { balanceCents: 10.5 }, 'balanceCents'],
    ['negative balance', { balanceCents: -1 }, 'balanceCents'],
    ['bad date', { balanceAsOf: '2026-02-30' }, 'balanceAsOf'],
    ['negative installments', { remainingInstallments: -1 }, 'remainingInstallments'],
    ['negative rate', { annualRateBps: -5 }, 'annualRateBps'],
  ])('rejects %s with 400', async (_label, override, field) => {
    const response = await send('POST', '/api/debts', { ...newDebt, ...override });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty(field);
  });

  it.each([
    ['rate above 100 %', { annualRateBps: 10_001 }, 'annualRateBps'],
    ['installments above 9999', { remainingInstallments: 10_000 }, 'remainingInstallments'],
  ])('rejects %s, as the form does', async (_label, override, field) => {
    const response = await send('POST', '/api/debts', { ...newDebt, ...override });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty(field);
  });
});

describe('PATCH /api/debts/:id', () => {
  const idOfSeeded = async () => (await list())[0]?.id ?? 0;

  it('edits other fields without touching the balance', async () => {
    const id = await idOfSeeded();
    const response = await send('PATCH', `/api/debts/${String(id)}`, {
      monthlyPaymentCents: 20_000,
      remainingInstallments: 18,
      annualRateBps: 700,
      notes: 'Revisado',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json<DebtDto>()).toMatchObject({
      monthlyPaymentCents: 20_000,
      remainingInstallments: 18,
      annualRateBps: 700,
      notes: 'Revisado',
      balanceCents: 300_000,
      balanceAsOf: '2026-01-31',
    });
  });

  it('updating the balance records its new as-of date, and later repayments count from it', async () => {
    const id = await idOfSeeded();
    await repay(id, '2026-02-10', 20_000);
    expect((await list())[0]?.estimatedBalanceCents).toBe(280_000);

    const response = await send('PATCH', `/api/debts/${String(id)}`, {
      balanceCents: 250_000,
      balanceAsOf: '2026-02-28',
    });
    expect(response.statusCode).toBe(200);
    // The February repayment is already in the new balance: it is not deducted twice.
    expect(response.json<DebtDto>()).toMatchObject({
      balanceCents: 250_000,
      balanceAsOf: '2026-02-28',
      repaidSinceCents: 0,
      estimatedBalanceCents: 250_000,
    });
    await repay(id, '2026-03-02', 10_000);
    expect((await list())[0]?.estimatedBalanceCents).toBe(240_000);
  });

  it('refuses a changed balance without its as-of date (400)', async () => {
    const response = await send('PATCH', `/api/debts/${String(await idOfSeeded())}`, {
      balanceCents: 1_000,
    });
    expect(response.statusCode).toBe(400);
    expect(response.json<{ fields: Record<string, string> }>().fields).toHaveProperty(
      'balanceAsOf',
    );
    expect((await list())[0]?.balanceCents).toBe(300_000);
  });

  it('accepts the same balance without a date, and a correction on the same date', async () => {
    const id = String(await idOfSeeded());
    expect((await send('PATCH', `/api/debts/${id}`, { balanceCents: 300_000 })).statusCode).toBe(
      200,
    );
    const same = await send('PATCH', `/api/debts/${id}`, {
      balanceCents: 299_000,
      balanceAsOf: '2026-01-31',
    });
    expect(same.statusCode).toBe(200);
  });

  it('refuses an as-of date earlier than the current one (400)', async () => {
    const response = await send('PATCH', `/api/debts/${String(await idOfSeeded())}`, {
      balanceCents: 1_000,
      balanceAsOf: '2026-01-30',
    });
    expect(response.statusCode).toBe(400);
    expect((await list())[0]?.balanceAsOf).toBe('2026-01-31');
  });

  it('rejects invalid values, unknown fields, and unknown or malformed ids', async () => {
    const id = String(await idOfSeeded());
    expect((await send('PATCH', `/api/debts/${id}`, { monthlyPaymentCents: 0 })).statusCode).toBe(
      400,
    );
    expect((await send('PATCH', `/api/debts/${id}`, { id: 5 })).statusCode).toBe(400);
    expect((await send('PATCH', '/api/debts/9999', { name: 'X' })).statusCode).toBe(404);
    expect((await send('PATCH', '/api/debts/abc', { name: 'X' })).statusCode).toBe(404);
  });
});

describe('linking a repayment movement to a debt', () => {
  it('rejects a debt on a non-repayment movement, and an unknown debt', async () => {
    const [debt] = await list();
    const expense = (await app.inject({ method: 'GET', url: '/api/categories' }))
      .json<CategoryDto[]>()
      .find((c) => c.kind === 'expense');
    const bad = await send('POST', '/api/movements', {
      date: '2026-02-01',
      kind: 'expense',
      categoryId: expense?.id,
      concept: 'x',
      amountCents: 100,
      debtId: debt?.id,
    });
    expect(bad.statusCode).toBe(400);
    const unknown = await send('POST', '/api/movements', {
      date: '2026-02-01',
      kind: 'repayment',
      categoryId: await repaymentCategory(),
      concept: 'x',
      amountCents: 100,
      debtId: 9999,
    });
    expect(unknown.statusCode).toBe(400);
  });

  it('turning a linked repayment into an expense needs debtId null (the web client sends it)', async () => {
    const [debt] = await list();
    await repay(debt?.id ?? 0, '2026-02-10', 5_000, 'Para convertir');
    const movements = (
      await app.inject({ method: 'GET', url: '/api/movements?month=2026-02' })
    ).json<{ id: number }[]>();
    const id = movements[0]?.id ?? 0;
    const expense = (await app.inject({ method: 'GET', url: '/api/categories' }))
      .json<CategoryDto[]>()
      .find((c) => c.kind === 'expense');
    const toExpense = { kind: 'expense', categoryId: expense?.id };

    // Without clearing the debt, the merged movement is invalid: the stored debt stays.
    expect((await send('PATCH', `/api/movements/${String(id)}`, toExpense)).statusCode).toBe(400);
    const ok = await send('PATCH', `/api/movements/${String(id)}`, { ...toExpense, debtId: null });
    expect(ok.statusCode).toBe(200);
    expect(ok.json<{ kind: string; debtId: number | null }>()).toMatchObject({
      kind: 'expense',
      debtId: null,
    });
    // It no longer counts as a repayment of the debt.
    expect((await list())[0]?.repayments.some((r) => r.concept === 'Para convertir')).toBe(false);
  });
});
