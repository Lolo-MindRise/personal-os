import { describe, expect, it } from 'vitest';
import { MONEY_ERRORS } from '../shared/money.js';
import {
  emptyForm,
  FORM_ERRORS,
  formFromMovement,
  mapApiFieldErrors,
  unmappedApiMessage,
  validateMovementForm,
  type MovementFormValues,
} from './movementForm.js';

const valid: MovementFormValues = {
  date: '2026-01-10',
  kind: 'expense',
  categoryId: '3',
  concept: ' Compra semanal ',
  amount: '1.234,56',
  notes: '',
};

describe('emptyForm', () => {
  it('defaults the date to today and the kind to expense', () => {
    expect(emptyForm('2026-03-05')).toMatchObject({
      date: '2026-03-05',
      kind: 'expense',
      amount: '',
    });
  });
});

describe('validateMovementForm', () => {
  it('builds the API payload: trimmed text, cents, empty notes as null', () => {
    expect(validateMovementForm(valid)).toEqual({
      ok: true,
      payload: {
        date: '2026-01-10',
        kind: 'expense',
        categoryId: 3,
        concept: 'Compra semanal',
        amountCents: 123_456,
        notes: null,
      },
    });
  });

  it('keeps non-empty notes, trimmed', () => {
    const result = validateMovementForm({ ...valid, notes: '  para dos ' });
    expect(result.ok && result.payload.notes).toBe('para dos');
  });

  it('reports every invalid field at once, in Spanish', () => {
    const result = validateMovementForm({
      date: '',
      kind: 'expense',
      categoryId: '',
      concept: '   ',
      amount: 'doce',
      notes: '',
    });
    expect(result).toEqual({
      ok: false,
      errors: {
        date: FORM_ERRORS.date,
        categoryId: FORM_ERRORS.categoryId,
        concept: FORM_ERRORS.concept,
        amount: MONEY_ERRORS.invalid,
      },
    });
  });

  it.each([
    ['', MONEY_ERRORS.empty],
    ['-5', MONEY_ERRORS.negative],
    ['0', MONEY_ERRORS.zero],
    ['12,345', MONEY_ERRORS.decimals],
  ])('shows the money error for the amount %j', (amount, message) => {
    const result = validateMovementForm({ ...valid, amount });
    expect(result).toEqual({ ok: false, errors: { amount: message } });
  });

  it('rejects an impossible date', () => {
    const result = validateMovementForm({ ...valid, date: '2026-02-30' });
    expect(result).toEqual({ ok: false, errors: { date: FORM_ERRORS.date } });
  });
});

describe('formFromMovement', () => {
  it('turns a movement back into editable text, amount in Spanish format', () => {
    const form = formFromMovement({
      id: 1,
      date: '2026-01-10',
      kind: 'income',
      categoryId: 2,
      categoryName: 'Nómina',
      concept: 'Nómina',
      amountCents: 200_005,
      notes: null,
      debtId: null,
      recurringItemId: null,
    });
    expect(form).toEqual({
      date: '2026-01-10',
      kind: 'income',
      categoryId: '2',
      concept: 'Nómina',
      amount: '2000,05',
      notes: '',
    });
    expect(validateMovementForm(form).ok).toBe(true);
  });
});

describe('mapApiFieldErrors', () => {
  it('maps API field names to form fields and drops unknown ones', () => {
    expect(
      mapApiFieldErrors({ amountCents: 'mal', kind: 'no coincide', debtId: 'x', _: 'y' }),
    ).toEqual({ amount: 'mal', kind: 'no coincide' });
  });
});

describe('unmappedApiMessage', () => {
  it('returns the message of a field the form does not have, e.g. debtId', () => {
    expect(unmappedApiMessage({ amountCents: 'mal', debtId: 'Solo las amortizaciones.' })).toBe(
      'Solo las amortizaciones.',
    );
  });

  it('returns nothing when every field is on the form', () => {
    expect(unmappedApiMessage({ amountCents: 'mal', kind: 'no coincide' })).toBeUndefined();
    expect(unmappedApiMessage({})).toBeUndefined();
  });
});
