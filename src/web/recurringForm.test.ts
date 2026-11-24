import { describe, expect, it } from 'vitest';
import { MONEY_ERRORS } from '../shared/money.js';
import {
  emptyRecurringForm,
  formFromItem,
  mapRecurringApiErrors,
  RECURRING_ERRORS,
  validateRecurringForm,
  type RecurringFormValues,
} from './recurringForm.js';

const valid: RecurringFormValues = {
  kind: 'expense',
  categoryId: '2',
  concept: ' Alquiler ',
  amount: '700,00',
  expectedDay: '5',
  startMonth: '2026-01',
  endMonth: '',
  notes: '',
};

describe('emptyRecurringForm', () => {
  it('starts as an expense from the given month, on day 1, with no end month', () => {
    expect(emptyRecurringForm('2026-03')).toMatchObject({
      kind: 'expense',
      startMonth: '2026-03',
      endMonth: '',
      expectedDay: '1',
      amount: '',
    });
  });
});

describe('validateRecurringForm', () => {
  it('builds the API payload: trimmed text, cents, empty end month and notes as null', () => {
    expect(validateRecurringForm(valid)).toEqual({
      ok: true,
      payload: {
        kind: 'expense',
        categoryId: 2,
        concept: 'Alquiler',
        amountCents: 70_000,
        expectedDay: 5,
        startMonth: '2026-01',
        endMonth: null,
        notes: null,
      },
    });
  });

  it('keeps an end month and notes', () => {
    const result = validateRecurringForm({ ...valid, endMonth: '2026-12', notes: ' Contrato ' });
    expect(result.ok && result.payload).toMatchObject({ endMonth: '2026-12', notes: 'Contrato' });
  });

  it('accepts the end month equal to the start month', () => {
    expect(validateRecurringForm({ ...valid, endMonth: '2026-01' }).ok).toBe(true);
  });

  it('reports every invalid field at once, in Spanish', () => {
    const result = validateRecurringForm({
      kind: 'expense',
      categoryId: '',
      concept: '  ',
      amount: 'mucho',
      expectedDay: '0',
      startMonth: '',
      endMonth: '',
      notes: '',
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        categoryId: RECURRING_ERRORS.categoryId,
        concept: RECURRING_ERRORS.concept,
        amount: MONEY_ERRORS.invalid,
        expectedDay: RECURRING_ERRORS.expectedDay,
        startMonth: RECURRING_ERRORS.startMonth,
      },
    });
  });

  it.each(['0', '32', '-1', '1.5', 'abc', '', ' ', '100', '1e1'])(
    'rejects the day %j',
    (expectedDay) => {
      const result = validateRecurringForm({ ...valid, expectedDay });
      expect(result).toEqual({ ok: false, errors: { expectedDay: RECURRING_ERRORS.expectedDay } });
    },
  );

  it.each(['1', '15', '31', ' 7 ', '09'])('accepts the day %j', (expectedDay) => {
    expect(validateRecurringForm({ ...valid, expectedDay }).ok).toBe(true);
  });

  it('shows the money error for a bad amount', () => {
    expect(validateRecurringForm({ ...valid, amount: '-5' })).toEqual({
      ok: false,
      errors: { amount: MONEY_ERRORS.negative },
    });
    expect(validateRecurringForm({ ...valid, amount: '' })).toEqual({
      ok: false,
      errors: { amount: MONEY_ERRORS.empty },
    });
  });

  it('rejects an end month before the start month, with its own message', () => {
    expect(validateRecurringForm({ ...valid, endMonth: '2025-12' })).toEqual({
      ok: false,
      errors: { endMonth: RECURRING_ERRORS.endBeforeStart },
    });
  });

  it('rejects malformed months', () => {
    expect(validateRecurringForm({ ...valid, startMonth: '2026-13' })).toEqual({
      ok: false,
      errors: { startMonth: RECURRING_ERRORS.startMonth },
    });
    expect(validateRecurringForm({ ...valid, endMonth: '2026-1' })).toEqual({
      ok: false,
      errors: { endMonth: RECURRING_ERRORS.endMonth },
    });
  });
});

describe('formFromItem', () => {
  it('turns an item back into editable text, amount in Spanish format', () => {
    const form = formFromItem({
      id: 3,
      kind: 'income',
      categoryId: 1,
      categoryName: 'Nómina ficticia',
      concept: 'Nómina',
      amountCents: 200_050,
      expectedDay: 28,
      startMonth: '2026-01',
      endMonth: '2026-12',
      notes: null,
    });
    expect(form).toEqual({
      kind: 'income',
      categoryId: '1',
      concept: 'Nómina',
      amount: '2000,50',
      expectedDay: '28',
      startMonth: '2026-01',
      endMonth: '2026-12',
      notes: '',
    });
    expect(validateRecurringForm(form).ok).toBe(true);
  });

  it('shows no end month as an empty field', () => {
    const form = formFromItem({
      id: 1,
      kind: 'expense',
      categoryId: 2,
      categoryName: 'Vivienda',
      concept: 'Alquiler',
      amountCents: 70_000,
      expectedDay: 2,
      startMonth: '2026-01',
      endMonth: null,
      notes: 'Contrato',
    });
    expect(form.endMonth).toBe('');
    expect(form.notes).toBe('Contrato');
  });
});

describe('mapRecurringApiErrors', () => {
  it('maps API field names to form fields and drops unknown ones', () => {
    expect(
      mapRecurringApiErrors({
        amountCents: 'mal',
        expectedDay: 'fuera',
        endMonth: 'antes',
        _: 'x',
      }),
    ).toEqual({ amount: 'mal', expectedDay: 'fuera', endMonth: 'antes' });
  });
});
