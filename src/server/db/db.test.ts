import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { budgetForMonth } from './budget.js';
import { openDatabase, type DbHandle } from './index.js';
import { budgetLines, categories, debts, goals, milestones, movements } from './schema.js';
import { seed } from './seed.js';

let handle: DbHandle;
beforeEach(() => {
  handle = openDatabase(':memory:');
});
afterEach(() => {
  handle.close();
});

const newCategory = (name: string, kind: 'income' | 'expense' | 'repayment') =>
  handle.db.insert(categories).values({ name, kind }).returning().get();

const newDebt = () =>
  handle.db
    .insert(debts)
    .values({
      name: 'Préstamo',
      monthlyPaymentCents: 10_000,
      balanceCents: 100_000,
      balanceAsOf: '2026-01-31',
      remainingInstallments: 10,
      annualRateBps: 1250,
    })
    .returning()
    .get();

describe('migrations', () => {
  it('apply to an empty database and create every table', () => {
    for (const table of [categories, movements, budgetLines, debts, goals, milestones]) {
      expect(handle.db.select().from(table).all()).toEqual([]);
    }
  });

  it('are idempotent when the same file is opened again, keeping its data', () => {
    const dir = mkdtempSync(join(tmpdir(), 'personal-os-test-'));
    try {
      const path = join(dir, 'test.sqlite');
      const first = openDatabase(path);
      first.db.insert(categories).values({ name: 'Ocio', kind: 'expense' }).run();
      first.close();
      const second = openDatabase(path);
      expect(second.db.select().from(categories).all()).toHaveLength(1);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('every table', () => {
  it('stamps id, created_at and updated_at', () => {
    const row = newCategory('Sueldo', 'income');
    expect(row.id).toBe(1);
    expect(row.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(row.updatedAt).toBe(row.createdAt);
  });

  it('refreshes updated_at on update', () => {
    const row = newCategory('Sueldo', 'income');
    const updated = handle.db
      .update(categories)
      .set({ name: 'Nómina' })
      .where(eq(categories.id, row.id))
      .returning()
      .get();
    expect(updated.name).toBe('Nómina');
    expect(updated.createdAt).toBe(row.createdAt);
    expect(updated.updatedAt >= row.updatedAt).toBe(true);
  });
});

describe('categories', () => {
  it('requires a unique name', () => {
    newCategory('Ocio', 'expense');
    expect(() => newCategory('Ocio', 'expense')).toThrow(/UNIQUE/);
  });

  it('rejects an unknown kind', () => {
    expect(() =>
      handle.db
        .insert(categories)
        // @ts-expect-error invalid kind on purpose
        .values({ name: 'X', kind: 'transfer' })
        .run(),
    ).toThrow(/CHECK/);
  });
});

describe('movements', () => {
  const base = { date: '2026-01-10', concept: 'Compra', amountCents: 1_000 };

  it('accepts a movement whose kind matches its category', () => {
    const cat = newCategory('Súper', 'expense');
    const row = handle.db
      .insert(movements)
      .values({ ...base, kind: 'expense', categoryId: cat.id })
      .returning()
      .get();
    expect(row.amountCents).toBe(1_000);
  });

  it("rejects a movement whose kind differs from its category's kind", () => {
    const cat = newCategory('Súper', 'expense');
    expect(() =>
      handle.db
        .insert(movements)
        .values({ ...base, kind: 'income', categoryId: cat.id })
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('rejects changing the category to one of another kind', () => {
    const cat = newCategory('Súper', 'expense');
    const other = newCategory('Sueldo', 'income');
    const row = handle.db
      .insert(movements)
      .values({ ...base, kind: 'expense', categoryId: cat.id })
      .returning()
      .get();
    expect(() =>
      handle.db
        .update(movements)
        .set({ categoryId: other.id })
        .where(eq(movements.id, row.id))
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('rejects zero, negative and fractional amounts', () => {
    const cat = newCategory('Súper', 'expense');
    const insert = (amountCents: number) =>
      handle.db
        .insert(movements)
        .values({ ...base, kind: 'expense', categoryId: cat.id, amountCents })
        .run();
    expect(() => insert(0)).toThrow(/CHECK/);
    expect(() => insert(-5)).toThrow(/CHECK/);
    expect(() => insert(12.5)).toThrow(/CHECK/); // SQLite would otherwise store a REAL
  });

  it('allows debt_id only on repayment movements', () => {
    const debt = newDebt();
    const expense = newCategory('Súper', 'expense');
    const repayment = newCategory('Amortización', 'repayment');
    expect(() =>
      handle.db
        .insert(movements)
        .values({ ...base, kind: 'expense', categoryId: expense.id, debtId: debt.id })
        .run(),
    ).toThrow(/CHECK/);
    const ok = handle.db
      .insert(movements)
      .values({ ...base, kind: 'repayment', categoryId: repayment.id, debtId: debt.id })
      .returning()
      .get();
    expect(ok.debtId).toBe(debt.id);
  });

  it('rejects an unknown debt and a malformed date', () => {
    const repayment = newCategory('Amortización', 'repayment');
    expect(() =>
      handle.db
        .insert(movements)
        .values({ ...base, kind: 'repayment', categoryId: repayment.id, debtId: 999 })
        .run(),
    ).toThrow(/FOREIGN KEY/);
    expect(() =>
      handle.db
        .insert(movements)
        .values({ ...base, date: '10/01/2026', kind: 'repayment', categoryId: repayment.id })
        .run(),
    ).toThrow(/CHECK/);
  });
});

describe('budget lines', () => {
  it('rejects a malformed month, a non-positive amount and a duplicate (category, month)', () => {
    const cat = newCategory('Súper', 'expense');
    const insert = (amountCents: number, validFrom: string) =>
      handle.db.insert(budgetLines).values({ categoryId: cat.id, amountCents, validFrom }).run();
    expect(() => insert(100, '2026-1')).toThrow(/CHECK/);
    expect(() => insert(100, '2026-01-01')).toThrow(/CHECK/);
    expect(() => insert(0, '2026-01')).toThrow(/CHECK/);
    insert(100, '2026-01');
    expect(() => insert(200, '2026-01')).toThrow(/UNIQUE/);
  });

  it('looks up the line with the latest valid_from not after the month', () => {
    const cat = newCategory('Súper', 'expense');
    const other = newCategory('Ocio', 'expense');
    for (const [categoryId, amountCents, validFrom] of [
      [cat.id, 30_000, '2026-01'],
      [cat.id, 35_000, '2026-04'],
      [cat.id, 40_000, '2026-09'],
      [other.id, 5_000, '2026-02'],
    ] as const) {
      handle.db.insert(budgetLines).values({ categoryId, amountCents, validFrom }).run();
    }
    const at = (month: string) => budgetForMonth(handle.db, cat.id, month)?.amountCents;
    expect(at('2025-12')).toBeUndefined(); // before any line
    expect(at('2026-01')).toBe(30_000);
    expect(at('2026-03')).toBe(30_000);
    expect(at('2026-04')).toBe(35_000); // change takes effect in its own month
    expect(at('2026-08')).toBe(35_000);
    expect(at('2026-09')).toBe(40_000);
    expect(at('2027-12')).toBe(40_000);
    expect(budgetForMonth(handle.db, other.id, '2026-01')).toBeUndefined();
  });
});

describe('debts, goals and milestones', () => {
  it('rejects invalid debts', () => {
    const insert = (over: Partial<typeof debts.$inferInsert>) =>
      handle.db
        .insert(debts)
        .values({
          name: 'D',
          monthlyPaymentCents: 1,
          balanceCents: 0,
          balanceAsOf: '2026-01-31',
          remainingInstallments: 0,
          annualRateBps: 0,
          ...over,
        })
        .run();
    expect(() => insert({})).not.toThrow(); // zero balance, installments and rate are valid
    expect(() => insert({ monthlyPaymentCents: 0 })).toThrow(/CHECK/);
    expect(() => insert({ balanceCents: -1 })).toThrow(/CHECK/);
    expect(() => insert({ annualRateBps: -1 })).toThrow(/CHECK/);
    expect(() => insert({ annualRateBps: 12.5 })).toThrow(/CHECK/);
    expect(() => insert({ balanceCents: 10.5 })).toThrow(/CHECK/);
    expect(() => insert({ remainingInstallments: -1 })).toThrow(/CHECK/);
    expect(() => insert({ balanceAsOf: 'ayer' })).toThrow(/CHECK/);
  });

  it('rejects invalid goals', () => {
    const insert = (targetAmountCents: number, targetDate: string) =>
      handle.db.insert(goals).values({ name: 'G', targetAmountCents, targetDate }).run();
    expect(() => insert(1, '2026-12-31')).not.toThrow();
    expect(() => insert(0, '2026-12-31')).toThrow(/CHECK/);
    expect(() => insert(1, '2026-12')).toThrow(/CHECK/);
  });

  it('defaults milestone status to pending and rejects unknown statuses', () => {
    const row = handle.db
      .insert(milestones)
      .values({ title: 'M', targetDate: '2026-06-30' })
      .returning()
      .get();
    expect(row.status).toBe('pending');
    expect(() =>
      handle.db
        .insert(milestones)
        // @ts-expect-error invalid status on purpose
        .values({ title: 'M2', targetDate: '2026-06-30', status: 'blocked' })
        .run(),
    ).toThrow(/CHECK/);
  });
});

describe('seed', () => {
  it('runs cleanly on a fresh database and fills every table', () => {
    seed(handle.db);
    expect(handle.db.select().from(categories).all().length).toBeGreaterThanOrEqual(4);
    expect(handle.db.select().from(movements).all().length).toBeGreaterThan(0);
    expect(handle.db.select().from(budgetLines).all().length).toBeGreaterThan(0);
    expect(handle.db.select().from(debts).all()).toHaveLength(1);
    expect(handle.db.select().from(goals).all()).toHaveLength(1);
    expect(handle.db.select().from(milestones).all()).toHaveLength(2);
  });
});
