import { describe, expect, it } from 'vitest';
import {
  confirmOverridesSchema,
  recurringItemCreateSchema,
  recurringItemUpdateSchema,
} from './schemas.js';

const item = {
  kind: 'expense',
  categoryId: 2,
  concept: 'Alquiler',
  amountCents: 70_000,
  expectedDay: 2,
  startMonth: '2026-01',
};

describe('recurringItemCreateSchema', () => {
  it('accepts a valid item, with or without an end month and notes', () => {
    expect(recurringItemCreateSchema.safeParse(item).success).toBe(true);
    expect(recurringItemCreateSchema.safeParse({ ...item, endMonth: null }).success).toBe(true);
    expect(recurringItemCreateSchema.safeParse({ ...item, endMonth: '2026-12' }).success).toBe(
      true,
    );
    expect(recurringItemCreateSchema.safeParse({ ...item, notes: 'Contrato anual' }).success).toBe(
      true,
    );
  });

  it.each([1, 15, 31])('accepts day %i', (expectedDay) => {
    expect(recurringItemCreateSchema.safeParse({ ...item, expectedDay }).success).toBe(true);
  });

  it.each([0, 32, -1, 15.5, Number.NaN])('rejects day %s', (expectedDay) => {
    expect(recurringItemCreateSchema.safeParse({ ...item, expectedDay }).success).toBe(false);
  });

  it('rejects a day given as text', () => {
    expect(recurringItemCreateSchema.safeParse({ ...item, expectedDay: '5' }).success).toBe(false);
  });

  it.each([0, -5, 12.5])('rejects amount %s (integer positive cents only)', (amountCents) => {
    expect(recurringItemCreateSchema.safeParse({ ...item, amountCents }).success).toBe(false);
  });

  it('rejects malformed months', () => {
    for (const startMonth of ['2026-1', '2026-13', '2026-01-01', '']) {
      expect(recurringItemCreateSchema.safeParse({ ...item, startMonth }).success, startMonth).toBe(
        false,
      );
    }
    expect(recurringItemCreateSchema.safeParse({ ...item, endMonth: '2026-00' }).success).toBe(
      false,
    );
  });

  it('does not allow an end month before the start month, but allows the same month', () => {
    const before = recurringItemCreateSchema.safeParse({ ...item, endMonth: '2025-12' });
    expect(before.success).toBe(false);
    expect(before.error?.issues[0]?.path).toEqual(['endMonth']);
    expect(before.error?.issues[0]?.message).toMatch(/anterior/);
    expect(recurringItemCreateSchema.safeParse({ ...item, endMonth: '2026-01' }).success).toBe(
      true,
    );
  });

  it('rejects a blank concept, an unknown kind and unknown fields', () => {
    expect(recurringItemCreateSchema.safeParse({ ...item, concept: '  ' }).success).toBe(false);
    expect(recurringItemCreateSchema.safeParse({ ...item, kind: 'transfer' }).success).toBe(false);
    expect(recurringItemCreateSchema.safeParse({ ...item, id: 1 }).success).toBe(false);
  });
});

describe('recurringItemUpdateSchema', () => {
  it('accepts any subset, including clearing the end month', () => {
    expect(recurringItemUpdateSchema.safeParse({}).success).toBe(true);
    expect(recurringItemUpdateSchema.safeParse({ amountCents: 100 }).success).toBe(true);
    expect(recurringItemUpdateSchema.safeParse({ endMonth: null }).success).toBe(true);
  });

  it('still validates the values it gets', () => {
    expect(recurringItemUpdateSchema.safeParse({ expectedDay: 40 }).success).toBe(false);
    expect(recurringItemUpdateSchema.safeParse({ unknown: 1 }).success).toBe(false);
  });
});

describe('confirmOverridesSchema', () => {
  it('accepts no overrides, and each override on its own', () => {
    expect(confirmOverridesSchema.safeParse({}).success).toBe(true);
    expect(confirmOverridesSchema.safeParse({ amountCents: 1_234 }).success).toBe(true);
    expect(confirmOverridesSchema.safeParse({ date: '2026-02-10' }).success).toBe(true);
    expect(confirmOverridesSchema.safeParse({ concept: 'Otro' }).success).toBe(true);
    expect(confirmOverridesSchema.safeParse({ notes: null }).success).toBe(true);
  });

  it('rejects bad values and fields that cannot be overridden (kind, category)', () => {
    expect(confirmOverridesSchema.safeParse({ amountCents: 0 }).success).toBe(false);
    expect(confirmOverridesSchema.safeParse({ amountCents: 1.5 }).success).toBe(false);
    expect(confirmOverridesSchema.safeParse({ date: '2026-02-30' }).success).toBe(false);
    expect(confirmOverridesSchema.safeParse({ concept: ' ' }).success).toBe(false);
    expect(confirmOverridesSchema.safeParse({ kind: 'income' }).success).toBe(false);
    expect(confirmOverridesSchema.safeParse({ categoryId: 3 }).success).toBe(false);
  });
});
