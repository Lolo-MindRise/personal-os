import { describe, expect, it } from 'vitest';
import {
  budgetLineCreateSchema,
  categoryCreateSchema,
  debtCreateSchema,
  goalCreateSchema,
  isoDate,
  isoMonth,
  milestoneCreateSchema,
  movementCreateSchema,
} from './schemas.js';

const movement = {
  date: '2026-01-10',
  kind: 'expense',
  categoryId: 1,
  concept: 'Compra',
  amountCents: 1_000,
};

describe('dates and months', () => {
  it('accepts real dates only', () => {
    expect(isoDate.safeParse('2024-02-29').success).toBe(true);
    for (const bad of [
      '2026-02-29',
      '2026-13-01',
      '2026-1-1',
      '10/01/2026',
      '2026-01-10T00:00:00Z',
    ]) {
      expect(isoDate.safeParse(bad).success, bad).toBe(false);
    }
  });

  it('accepts YYYY-MM only', () => {
    expect(isoMonth.safeParse('2026-12').success).toBe(true);
    for (const bad of ['2026-00', '2026-13', '2026-1', '2026-01-01']) {
      expect(isoMonth.safeParse(bad).success, bad).toBe(false);
    }
  });
});

describe('categoryCreateSchema', () => {
  it('accepts valid input and rejects bad kind, blank name and extra keys', () => {
    expect(categoryCreateSchema.safeParse({ name: 'Ocio', kind: 'expense' }).success).toBe(true);
    expect(categoryCreateSchema.safeParse({ name: 'Ocio', kind: 'transfer' }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: '   ', kind: 'expense' }).success).toBe(false);
    expect(categoryCreateSchema.safeParse({ name: 'Ocio', kind: 'expense', id: 1 }).success).toBe(
      false,
    );
  });
});

describe('movementCreateSchema', () => {
  it('accepts a valid movement', () => {
    expect(movementCreateSchema.safeParse(movement).success).toBe(true);
  });

  it.each([0, -100, 12.5, Number.NaN, Infinity])(
    'rejects amount %s (integer positive cents only)',
    (amountCents) => {
      expect(movementCreateSchema.safeParse({ ...movement, amountCents }).success).toBe(false);
    },
  );

  it('rejects an amount given as a string', () => {
    expect(movementCreateSchema.safeParse({ ...movement, amountCents: '1000' }).success).toBe(
      false,
    );
  });

  it('allows debtId only on repayments', () => {
    expect(movementCreateSchema.safeParse({ ...movement, debtId: 3 }).success).toBe(false);
    expect(
      movementCreateSchema.safeParse({ ...movement, kind: 'repayment', debtId: 3 }).success,
    ).toBe(true);
    expect(movementCreateSchema.safeParse({ ...movement, debtId: null }).success).toBe(true);
  });

  it('rejects a bad date and an empty concept', () => {
    expect(movementCreateSchema.safeParse({ ...movement, date: '2026-02-30' }).success).toBe(false);
    expect(movementCreateSchema.safeParse({ ...movement, concept: ' ' }).success).toBe(false);
  });
});

describe('budgetLineCreateSchema', () => {
  it('requires a month and positive cents', () => {
    const ok = { categoryId: 1, amountCents: 100, validFrom: '2026-01' };
    expect(budgetLineCreateSchema.safeParse(ok).success).toBe(true);
    expect(budgetLineCreateSchema.safeParse({ ...ok, validFrom: '2026-01-01' }).success).toBe(
      false,
    );
    expect(budgetLineCreateSchema.safeParse({ ...ok, amountCents: 0 }).success).toBe(false);
  });
});

describe('debtCreateSchema', () => {
  const ok = {
    name: 'Préstamo',
    monthlyPaymentCents: 15_000,
    balanceCents: 0,
    balanceAsOf: '2026-01-31',
    remainingInstallments: 0,
    annualRateBps: 1250,
  };

  it('accepts basis points and zero balance', () => {
    expect(debtCreateSchema.safeParse(ok).success).toBe(true);
  });

  it('rejects a fractional rate (12.5 is not basis points), negatives and a zero payment', () => {
    expect(debtCreateSchema.safeParse({ ...ok, annualRateBps: 12.5 }).success).toBe(false);
    expect(debtCreateSchema.safeParse({ ...ok, annualRateBps: -1 }).success).toBe(false);
    expect(debtCreateSchema.safeParse({ ...ok, balanceCents: -1 }).success).toBe(false);
    expect(debtCreateSchema.safeParse({ ...ok, monthlyPaymentCents: 0 }).success).toBe(false);
  });
});

describe('goalCreateSchema and milestoneCreateSchema', () => {
  it('validate goals', () => {
    const ok = { name: 'Fondo', targetAmountCents: 100, targetDate: '2026-12-31' };
    expect(goalCreateSchema.safeParse(ok).success).toBe(true);
    expect(goalCreateSchema.safeParse({ ...ok, targetAmountCents: 0 }).success).toBe(false);
    expect(goalCreateSchema.safeParse({ ...ok, targetDate: '2026-12' }).success).toBe(false);
  });

  it('default milestone status to pending and reject unknown statuses', () => {
    const parsed = milestoneCreateSchema.parse({ title: 'Hito', targetDate: '2026-06-30' });
    expect(parsed.status).toBe('pending');
    expect(
      milestoneCreateSchema.safeParse({
        title: 'Hito',
        targetDate: '2026-06-30',
        status: 'blocked',
      }).success,
    ).toBe(false);
  });
});
