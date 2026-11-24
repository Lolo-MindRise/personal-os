import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto, DashboardDto, DebtDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { openDatabase, type DbHandle } from './db/index.js';
import { seed } from './db/seed.js';

let handle: DbHandle;
let app: FastifyInstance;

async function start(withSeed: boolean) {
  handle = openDatabase(':memory:');
  if (withSeed) {
    seed(handle.db);
  }
  app = buildApp({ db: handle.db });
  await app.ready();
}
afterEach(async () => {
  await app.close();
  handle.close();
});

const TODAY = '2026-01-31';
const dashboard = async (month: string, today = TODAY) => {
  const response = await app.inject({
    method: 'GET',
    url: `/api/dashboard?month=${month}&today=${today}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json<DashboardDto>();
};
const send = (method: 'POST' | 'PUT', url: string, payload: unknown) =>
  app.inject({ method, url, payload: payload as object });

// Seed, January 2026: income 2.000,00; expenses 900,70 (Vivienda 700,00, Supermercado 176,70,
// Ocio 24,00); repayment 100,00 (dated before the debt's balance date, so not deducted).
// Pending in January: Internet 35, Electricidad 65, Gimnasio 30. Budget from 2026-01: Vivienda
// 700, Supermercado 350, Ocio 100. One debt: 3.000,00 as of 2026-01-31, 20 installments.
// One goal: 6.000,00 by 2026-12-31. Milestones: one done, "Liquidar el préstamo" 2027-09-30.
describe('with seed data', () => {
  beforeEach(() => start(true));

  it('key figures', async () => {
    const { keyFigures, setup } = await dashboard('2026-01');
    expect(keyFigures.accumulatedSavingsCents).toBe(99_930); // no initial balance: all movements
    expect(keyFigures.totalDebtCents).toBe(300_000);
    expect(keyFigures.projectedSavingsCents).toBe(99_930 - 13_000);
    expect(keyFigures.nextGoal).toMatchObject({
      name: 'Fondo de emergencia',
      targetAmountCents: 600_000,
      progressPercent: 16,
      remainingCents: 500_070,
      status: 'open',
      monthsLeft: 12,
      monthlyRequiredCents: Math.ceil(500_070 / 12),
    });
    expect(setup).toEqual({
      initialBalance: false,
      movements: true,
      goals: true,
      budget: true,
      debts: true,
    });
  });

  it('accumulated savings use the initial balance and follow the selected month', async () => {
    await send('PUT', '/api/settings', {
      initialSavingsCents: 500_000,
      initialSavingsDate: '2025-12-31',
    });
    expect((await dashboard('2026-01')).keyFigures.accumulatedSavingsCents).toBe(599_930);
    expect((await dashboard('2025-12')).keyFigures.accumulatedSavingsCents).toBe(500_000);
    expect((await dashboard('2026-01')).setup.initialBalance).toBe(true);
    // Before the initial date the card and the chart agree: no figure.
    const before = await dashboard('2025-11');
    expect(before.keyFigures.accumulatedSavingsCents).toBeNull();
    expect(before.months[11]?.accumulatedCents).toBeNull();
  });

  it('twelve months ending at the selected one, with the same figures as the yearly summary', async () => {
    const { months } = await dashboard('2026-01');
    expect(months).toHaveLength(12);
    expect(months[0]?.month).toBe('2025-02');
    expect(months[11]).toEqual({
      month: '2026-01',
      incomeCents: 200_000,
      expenseCents: 90_070,
      repaymentCents: 10_000,
      savingsCents: 99_930,
      accumulatedCents: 99_930,
    });
    expect(months.slice(0, 11).every((m) => m.incomeCents === 0 && m.savingsCents === 0)).toBe(
      true,
    );
    const year = (await app.inject({ method: 'GET', url: '/api/years/2026/summary' })).json<{
      rows: { month: string; savingsCents: number }[];
    }>();
    expect(year.rows[0]?.savingsCents).toBe(months[11]?.savingsCents);
  });

  it('the window across a year boundary has no gap or repeat', async () => {
    const { months } = await dashboard('2026-03');
    expect(months.map((m) => m.month)).toEqual([
      '2025-04',
      '2025-05',
      '2025-06',
      '2025-07',
      '2025-08',
      '2025-09',
      '2025-10',
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
    expect(months[9]?.incomeCents).toBe(200_000);
    expect(months[10]?.incomeCents).toBe(0);
    expect(months[10]?.accumulatedCents).toBe(99_930);
  });

  it('expenses of the month by category against the budget in effect', async () => {
    const { categories } = await dashboard('2026-01');
    expect(
      categories.map((c) => [c.categoryName, c.budgetCents, c.actualCents, c.overBudget]),
    ).toEqual([
      ['Ocio', 10_000, 2_400, false],
      ['Supermercado', 35_000, 17_670, false],
      ['Vivienda', 70_000, 70_000, false],
    ]);
  });

  it('marks a category over budget, and lists a spent category that has no budget', async () => {
    const all = (await app.inject({ method: 'GET', url: '/api/categories' })).json<CategoryDto[]>();
    const id = (name: string) => all.find((c) => c.name === name)?.id;
    await send('POST', '/api/movements', {
      date: '2026-01-28',
      kind: 'expense',
      categoryId: id('Ocio'),
      concept: 'Concierto',
      amountCents: 20_000,
    });
    await send('POST', '/api/movements', {
      date: '2026-01-29',
      kind: 'expense',
      categoryId: id('Suministros'),
      concept: 'Agua',
      amountCents: 1_000,
    });
    const { categories } = await dashboard('2026-01');
    expect(categories.find((c) => c.categoryName === 'Ocio')).toMatchObject({
      actualCents: 22_400,
      overBudget: true,
    });
    expect(categories.find((c) => c.categoryName === 'Suministros')).toMatchObject({
      budgetCents: null,
      actualCents: 1_000,
      overBudget: false,
    });
  });

  it('debts: estimated balance, installments and a progress baseline', async () => {
    const { debts } = await dashboard('2026-01');
    expect(debts.totalEstimatedCents).toBe(300_000);
    expect(debts.items).toHaveLength(1);
    expect(debts.items[0]).toMatchObject({
      name: 'Préstamo personal de ejemplo',
      estimatedBalanceCents: 300_000,
      remainingInstallments: 20,
      monthlyPaymentCents: 15_000,
      recordedBalanceCents: 300_000,
      balanceAsOf: '2026-01-31',
      repaidSinceCents: 0,
      progressPercent: 0,
    });
  });

  it('a linked repayment after the balance date lowers the estimate and moves the progress', async () => {
    const [debt] = (await app.inject({ method: 'GET', url: '/api/debts' })).json<DebtDto[]>();
    const all = (await app.inject({ method: 'GET', url: '/api/categories' })).json<CategoryDto[]>();
    await send('POST', '/api/movements', {
      date: '2026-02-10',
      kind: 'repayment',
      categoryId: all.find((c) => c.kind === 'repayment')?.id,
      concept: 'Extra',
      amountCents: 75_000,
      debtId: debt?.id,
    });
    const { debts, keyFigures } = await dashboard('2026-02', '2026-02-15');
    expect(debts.items[0]).toMatchObject({
      estimatedBalanceCents: 225_000,
      repaidSinceCents: 75_000,
      progressPercent: 25,
    });
    expect(keyFigures.totalDebtCents).toBe(225_000);
  });

  it("upcoming: the month's pending entries and the next milestones that are not done", async () => {
    const { upcoming } = await dashboard('2026-01');
    expect(upcoming.pending.map((e) => e.concept).sort()).toEqual([
      'Electricidad',
      'Gimnasio',
      'Internet',
    ]);
    expect(upcoming.milestones).toEqual([
      expect.objectContaining({ title: 'Liquidar el préstamo', overdue: false }),
    ]);
    // A later month has all five fixed items pending.
    expect((await dashboard('2026-02')).upcoming.pending).toHaveLength(5);
  });

  it('overdue milestones lead, and only three are listed', async () => {
    for (const [title, targetDate] of [
      ['Uno', '2026-05-01'],
      ['Dos', '2026-06-01'],
      ['Tres', '2026-07-01'],
      ['Atrasado', '2025-11-01'],
    ] as const) {
      await send('POST', '/api/milestones', { title, targetDate });
    }
    const { milestones } = (await dashboard('2026-01')).upcoming;
    expect(milestones.map((m) => m.title)).toEqual(['Atrasado', 'Uno', 'Dos']);
    expect(milestones.map((m) => m.overdue)).toEqual([true, false, false]);
  });

  it('a past goal is not the next goal', async () => {
    const { keyFigures } = await dashboard('2026-01', '2027-02-01');
    expect(keyFigures.nextGoal).toBeNull();
  });

  it('defaults to the month of today, and rejects bad input', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/dashboard?today=2026-01-15' });
    expect(response.json<DashboardDto>().month).toBe('2026-01');
    const noParams = await app.inject({ method: 'GET', url: '/api/dashboard' });
    expect(noParams.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/dashboard?month=2026-13' })).statusCode,
    ).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/dashboard?today=hoy' })).statusCode).toBe(
      400,
    );
  });
});

describe('with an empty database', () => {
  beforeEach(() => start(false));

  it('every block is empty but well-formed', async () => {
    const data = await dashboard('2026-03');
    expect(data.setup).toEqual({
      initialBalance: false,
      movements: false,
      goals: false,
      budget: false,
      debts: false,
    });
    expect(data.keyFigures).toEqual({
      accumulatedSavingsCents: 0,
      nextGoal: null,
      totalDebtCents: 0,
      projectedSavingsCents: 0,
    });
    expect(data.months).toHaveLength(12);
    expect(data.months.every((m) => m.incomeCents === 0 && m.expenseCents === 0)).toBe(true);
    expect(data.categories).toEqual([]);
    expect(data.debts).toEqual({ items: [], totalEstimatedCents: 0 });
    expect(data.upcoming).toEqual({ pending: [], milestones: [] });
  });

  it('works across a year boundary too', async () => {
    const { months } = await dashboard('2026-01');
    expect(months[0]?.month).toBe('2025-02');
    expect(months[11]?.month).toBe('2026-01');
  });
});
