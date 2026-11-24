import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CategoryDto, DebtDto, MovementDto, RecurringItemDto } from '../shared/api.js';
import { buildApp } from './app.js';
import { MIGRATIONS_DIR } from './db/config.js';
import { openDatabase, type DbHandle } from './db/index.js';

// Task 0013, block 1: confirmed installments of a linked recurring item reduce the debt's
// estimated balance by their principal part (French amortization).

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

const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, ...(payload === undefined ? {} : { payload: payload as object }) });

async function repaymentCategory(): Promise<number> {
  const created = await call('POST', '/api/categories', { name: 'Préstamos', kind: 'repayment' });
  return created.json<CategoryDto>().id;
}

/** 10.000,00 € at 6 %, recorded on 2026-01-01. */
async function newDebt(extra: Record<string, unknown> = {}): Promise<DebtDto> {
  const response = await call('POST', '/api/debts', {
    name: 'Préstamo de ejemplo',
    monthlyPaymentCents: 86_066,
    balanceCents: 1_000_000,
    balanceAsOf: '2026-01-01',
    remainingInstallments: 12,
    annualRateBps: 600,
    ...extra,
  });
  expect(response.statusCode).toBe(201);
  return response.json<DebtDto>();
}

async function installmentItem(
  debtId: number | null,
  categoryId: number,
  extra: Record<string, unknown> = {},
): Promise<RecurringItemDto> {
  const response = await call('POST', '/api/recurring-items', {
    kind: 'repayment',
    categoryId,
    concept: 'Cuota del préstamo',
    amountCents: 86_066,
    expectedDay: 1,
    startMonth: '2026-02',
    debtId,
    ...extra,
  });
  expect(response.statusCode).toBe(201);
  return response.json<RecurringItemDto>();
}

const confirm = (itemId: number, month: string, body: unknown = {}) =>
  call('POST', `/api/recurring-items/${String(itemId)}/months/${month}/confirm`, body);
const debtOf = async (id: number) =>
  (await call('GET', '/api/debts')).json<DebtDto[]>().find((d) => d.id === id);

describe('recurring items linked to a debt', () => {
  it('stores and returns the debt link, and lets it be cleared', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt();
    const item = await installmentItem(debt.id, category);
    expect(item.debtId).toBe(debt.id);

    const cleared = await call('PATCH', `/api/recurring-items/${String(item.id)}`, {
      debtId: null,
    });
    expect(cleared.json<RecurringItemDto>().debtId).toBeNull();
    expect(
      (await call('GET', '/api/recurring-items')).json<RecurringItemDto[]>()[0]?.debtId,
    ).toBeNull();
  });

  it('rejects a debt that does not exist, and a debt on a non-repayment item', async () => {
    const category = await repaymentCategory();
    const missing = await call('POST', '/api/recurring-items', {
      kind: 'repayment',
      categoryId: category,
      concept: 'x',
      amountCents: 100,
      expectedDay: 1,
      startMonth: '2026-02',
      debtId: 999,
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json<{ fields: Record<string, string> }>().fields.debtId).toMatch(/no existe/);

    const debt = await newDebt();
    const expense = (
      await call('POST', '/api/categories', { name: 'Ocio', kind: 'expense' })
    ).json<CategoryDto>();
    const wrongKind = await call('POST', '/api/recurring-items', {
      kind: 'expense',
      categoryId: expense.id,
      concept: 'x',
      amountCents: 100,
      expectedDay: 1,
      startMonth: '2026-02',
      debtId: debt.id,
    });
    expect(wrongKind.statusCode).toBe(400);
    expect(wrongKind.json<{ fields: Record<string, string> }>().fields.debtId).toMatch(
      /amortizaciones/,
    );
  });

  it('refuses to change a linked item to another kind while it keeps its debt', async () => {
    const category = await repaymentCategory();
    const item = await installmentItem((await newDebt()).id, category);
    const expense = (
      await call('POST', '/api/categories', { name: 'Ocio', kind: 'expense' })
    ).json<CategoryDto>();
    const response = await call('PATCH', `/api/recurring-items/${String(item.id)}`, {
      kind: 'expense',
      categoryId: expense.id,
    });
    expect(response.statusCode).toBe(400);
  });
});

describe('estimated balance with installments', () => {
  it('does not move until an installment is confirmed', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt();
    await installmentItem(debt.id, category);
    const before = await debtOf(debt.id);
    expect(before?.estimatedBalanceCents).toBe(1_000_000);
    expect(before?.installments).toEqual([]);
    expect(before?.interestPaidCents).toBe(0);
  });

  it('reduces the balance by the principal of each confirmed installment, to the cent', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt();
    const item = await installmentItem(debt.id, category);
    expect((await confirm(item.id, '2026-02')).statusCode).toBe(201);
    expect((await confirm(item.id, '2026-03')).statusCode).toBe(201);
    const after = await debtOf(debt.id);
    // Hand-computed French schedule: 50,00 + 45,95 of interest; 810,66 + 814,71 of principal.
    expect(after?.estimatedBalanceCents).toBe(837_463);
    expect(after?.principalPaidCents).toBe(81_066 + 81_471);
    expect(after?.interestPaidCents).toBe(5_000 + 4_595);
    expect(after?.repaidSinceCents).toBe(0); // extras only
    expect(after?.installments.map((i) => i.balanceAfterCents)).toEqual([918_934, 837_463]);
  });

  it('uses the amount actually paid when it differs from the expected one', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt();
    const item = await installmentItem(debt.id, category);
    await confirm(item.id, '2026-02', { amountCents: 90_000 });
    const after = await debtOf(debt.id);
    expect(after?.installments[0]).toMatchObject({ paidCents: 90_000, interestCents: 5_000 });
    expect(after?.estimatedBalanceCents).toBe(1_000_000 - 85_000);
  });

  it('combines installments with extra repayments, in date order', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt();
    const item = await installmentItem(debt.id, category);
    await confirm(item.id, '2026-02');
    // An extra of 1.000,00 between the two installments, linked to the same debt.
    const extra = await call('POST', '/api/movements', {
      date: '2026-02-15',
      kind: 'repayment',
      categoryId: category,
      concept: 'Extra',
      amountCents: 100_000,
      debtId: debt.id,
    });
    expect(extra.statusCode).toBe(201);
    await confirm(item.id, '2026-03');
    const after = await debtOf(debt.id);
    // Second installment: interest on 8.189,34 is 40,95, so the principal is 819,71.
    expect(after?.installments[1]).toMatchObject({ interestCents: 4_095, principalCents: 81_971 });
    expect(after?.estimatedBalanceCents).toBe(736_963);
    expect(after?.repaidSinceCents).toBe(100_000);
    expect(after?.repayments).toHaveLength(1); // the extra only, not the installments
  });

  it('gives the same estimate when installments are confirmed out of order', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt();
    const item = await installmentItem(debt.id, category);
    await confirm(item.id, '2026-04');
    await confirm(item.id, '2026-02');
    await confirm(item.id, '2026-03');
    const after = await debtOf(debt.id);
    expect(after?.installments.map((i) => i.date)).toEqual([
      '2026-02-01',
      '2026-03-01',
      '2026-04-01',
    ]);
    expect(after?.installments.map((i) => i.balanceAfterCents)).toEqual([
      918_934, 837_463, 755_584,
    ]);
    expect(after?.estimatedBalanceCents).toBe(755_584);
  });

  it('ignores installments dated on or before the as-of date', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt({ balanceAsOf: '2026-02-01' });
    const item = await installmentItem(debt.id, category, { startMonth: '2026-01' });
    await confirm(item.id, '2026-01');
    await confirm(item.id, '2026-02'); // dated 2026-02-01 = the as-of date
    const after = await debtOf(debt.id);
    expect(after?.installments).toEqual([]);
    expect(after?.estimatedBalanceCents).toBe(1_000_000);
  });

  it('never goes below zero when the debt is paid off', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt({ balanceCents: 100_000, monthlyPaymentCents: 86_066 });
    const item = await installmentItem(debt.id, category);
    await confirm(item.id, '2026-02');
    await confirm(item.id, '2026-03');
    await confirm(item.id, '2026-04');
    const after = await debtOf(debt.id);
    expect(after?.estimatedBalanceCents).toBe(0);
    expect(after?.installments.map((i) => i.balanceAfterCents)).toEqual([14_434, 0, 0]);
    expect(after?.principalPaidCents).toBe(100_000);
  });

  it('does not count an unlinked item, nor another debt’s item', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt();
    const other = await newDebt({ name: 'Otra' });
    const unlinked = await installmentItem(null, category, { concept: 'Sin deuda' });
    const forOther = await installmentItem(other.id, category, { concept: 'Otra deuda' });
    await confirm(unlinked.id, '2026-02');
    await confirm(forOther.id, '2026-02');
    expect((await debtOf(debt.id))?.estimatedBalanceCents).toBe(1_000_000);
    expect((await debtOf(other.id))?.installments).toHaveLength(1);
  });

  it('forgets an installment when its movement is deleted, and the item is pending again', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt();
    const item = await installmentItem(debt.id, category);
    const movement = (await confirm(item.id, '2026-02')).json<MovementDto>();
    expect((await debtOf(debt.id))?.estimatedBalanceCents).toBe(918_934);
    await call('DELETE', `/api/movements/${String(movement.id)}`);
    expect((await debtOf(debt.id))?.estimatedBalanceCents).toBe(1_000_000);
  });

  it('never counts an installment movement as an extra repayment, even of another debt', async () => {
    const category = await repaymentCategory();
    const debtA = await newDebt();
    const debtB = await newDebt({ name: 'B' });
    const item = await installmentItem(debtA.id, category);
    const movement = (await confirm(item.id, '2026-02')).json<MovementDto>();
    // The same movement also claims to be an extra repayment of debt B.
    handle.sqlite
      .prepare('UPDATE movements SET debt_id = ? WHERE id = ?')
      .run(debtB.id, movement.id);
    const a = await debtOf(debtA.id);
    const b = await debtOf(debtB.id);
    expect(a?.installments).toHaveLength(1);
    expect(a?.repayments).toEqual([]);
    expect(b?.repayments).toEqual([]);
    expect(b?.estimatedBalanceCents).toBe(1_000_000);
  });

  it('reports extra repayments capped at what was owed, so the figures add up', async () => {
    const debt = await newDebt({ balanceCents: 50_000 });
    const category = await repaymentCategory();
    await call('POST', '/api/movements', {
      date: '2026-02-10',
      kind: 'repayment',
      categoryId: category,
      concept: 'Extra grande',
      amountCents: 80_000,
      debtId: debt.id,
    });
    const after = await debtOf(debt.id);
    expect(after?.estimatedBalanceCents).toBe(0);
    expect(after?.repaidSinceCents).toBe(50_000);
    expect(after?.repayments[0]?.amountCents).toBe(80_000); // the movement itself is unchanged
  });

  it('feeds the dashboard: progress and interest include the installments', async () => {
    const category = await repaymentCategory();
    const debt = await newDebt();
    const item = await installmentItem(debt.id, category);
    await confirm(item.id, '2026-02');
    const dashboard = (await call('GET', '/api/dashboard?month=2026-02&today=2026-02-20')).json<{
      debts: {
        items: {
          estimatedBalanceCents: number;
          repaidSinceCents: number;
          interestPaidCents: number;
          progressPercent: number | null;
        }[];
      };
    }>();
    expect(dashboard.debts.items[0]).toMatchObject({
      estimatedBalanceCents: 918_934,
      repaidSinceCents: 81_066,
      interestPaidCents: 5_000,
      progressPercent: 8,
    });
  });
});

describe('migration 0004', () => {
  it('adds the column without touching existing rows, skips or movement links', () => {
    // Apply migrations 0000–0003 by hand, add data, then apply 0004 on top.
    const sqlite = new Database(':memory:');
    sqlite.pragma('foreign_keys = ON');
    const journal = JSON.parse(
      readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
    ) as {
      entries: { tag: string }[];
    };
    const apply = (tag: string) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8');
      for (const statement of sql.split('--> statement-breakpoint')) {
        sqlite.exec(statement);
      }
    };
    const last = journal.entries.at(-1)?.tag ?? '';
    expect(last).toMatch(/^0004_/);
    for (const entry of journal.entries.slice(0, -1)) {
      apply(entry.tag);
    }
    sqlite.exec(`
      INSERT INTO categories (id, name, kind) VALUES (1, 'Préstamos', 'repayment');
      INSERT INTO recurring_items (id, kind, category_id, concept, amount_cents, expected_day, start_month)
        VALUES (1, 'repayment', 1, 'Cuota', 10000, 1, '2026-01');
      INSERT INTO recurring_skips (recurring_item_id, month) VALUES (1, '2026-02');
      INSERT INTO movements (date, kind, category_id, concept, amount_cents, recurring_item_id)
        VALUES ('2026-01-01', 'repayment', 1, 'Cuota', 10000, 1);
    `);
    apply(last);
    const item = sqlite.prepare('SELECT concept, debt_id FROM recurring_items WHERE id = 1').get();
    expect(item).toEqual({ concept: 'Cuota', debt_id: null });
    expect(sqlite.prepare('SELECT count(*) AS n FROM recurring_skips').get()).toEqual({ n: 1 });
    expect(sqlite.prepare('SELECT recurring_item_id AS id FROM movements').get()).toEqual({
      id: 1,
    });
    // The check and the foreign key are in place.
    expect(() => sqlite.exec('UPDATE recurring_items SET debt_id = 99 WHERE id = 1')).toThrow(
      /FOREIGN KEY/,
    );
    sqlite.exec(
      "INSERT INTO debts (id, name, monthly_payment_cents, balance_cents, balance_as_of, remaining_installments, annual_rate_bps) VALUES (1, 'D', 100, 100, '2026-01-01', 1, 0)",
    );
    sqlite.exec("INSERT INTO categories (id, name, kind) VALUES (2, 'Ocio', 'expense')");
    expect(() =>
      sqlite.exec(
        "INSERT INTO recurring_items (kind, category_id, concept, amount_cents, expected_day, start_month, debt_id) VALUES ('expense', 2, 'x', 100, 1, '2026-01', 1)",
      ),
    ).toThrow(/recurring_items_debt_only_on_repayment/);
    sqlite.close();
  });
});
