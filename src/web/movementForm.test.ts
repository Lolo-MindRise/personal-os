import { describe, expect, it } from 'vitest';
import { MONEY_ERRORS } from '../shared/money.js';
import {
  emptyForm,
  FORM_ERRORS,
  formFromMovement,
  mapApiFieldErrors,
  payloadForUpdate,
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
  debtId: '',
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
      debtId: '',
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
      accountId: 1,
      recurringItemId: null,
    });
    expect(form).toEqual({
      date: '2026-01-10',
      kind: 'income',
      categoryId: '2',
      concept: 'Nómina',
      amount: '2000,05',
      notes: '',
      debtId: '',
      accountId: '1',
    });
    expect(validateMovementForm(form).ok).toBe(true);
  });

  it('sends the account only when one is chosen', () => {
    const chosen = validateMovementForm({ ...valid, accountId: '2' });
    expect(chosen.ok && chosen.payload.accountId).toBe(2);
    const none = validateMovementForm({ ...valid, accountId: '' });
    expect(none.ok && 'accountId' in none.payload).toBe(false);
  });

  it('keeps the linked debt of a repayment as text', () => {
    const form = formFromMovement({
      id: 1,
      date: '2026-01-25',
      kind: 'repayment',
      categoryId: 6,
      categoryName: 'Amortización extra',
      concept: 'Extra',
      amountCents: 10_000,
      notes: null,
      debtId: 3,
      accountId: 1,
      recurringItemId: null,
    });
    expect(form.debtId).toBe('3');
  });
});

describe('debt link in the payload', () => {
  const repayment: MovementFormValues = { ...valid, kind: 'repayment', categoryId: '6' };

  it('sends the chosen debt on a repayment, and null for none', () => {
    const linked = validateMovementForm({ ...repayment, debtId: '3' });
    const free = validateMovementForm({ ...repayment, debtId: '' });
    expect(linked.ok && linked.payload.debtId).toBe(3);
    expect(free.ok && free.payload.debtId).toBeNull();
  });

  it('never sends a debt for other kinds, even a stale one', () => {
    const result = validateMovementForm({ ...valid, kind: 'expense', debtId: '3' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect('debtId' in result.payload).toBe(false);
    }
  });
});

describe('mapApiFieldErrors', () => {
  it('maps API field names to form fields and drops unknown ones', () => {
    expect(
      mapApiFieldErrors({ amountCents: 'mal', kind: 'no coincide', debtId: 'x', _: 'y' }),
    ).toEqual({ amount: 'mal', kind: 'no coincide', debtId: 'x' });
  });
});

describe('unmappedApiMessage', () => {
  it('returns the message of a field the form does not have, e.g. recurringItemId', () => {
    expect(
      unmappedApiMessage({ amountCents: 'mal', recurringItemId: 'Solo las amortizaciones.' }),
    ).toBe('Solo las amortizaciones.');
  });

  it('returns nothing when every field is on the form', () => {
    expect(unmappedApiMessage({ amountCents: 'mal', kind: 'no coincide' })).toBeUndefined();
    expect(unmappedApiMessage({})).toBeUndefined();
  });
});

describe('payloadForUpdate', () => {
  const expense = () => {
    const result = validateMovementForm(valid);
    if (!result.ok) {
      throw new Error('fixture invalid');
    }
    return result.payload;
  };

  it('clears the stored debt when a linked repayment becomes another kind', () => {
    expect(payloadForUpdate(expense(), 3)).toEqual({ ...expense(), debtId: null });
  });

  it('leaves the payload alone when there was no debt, or the kind is still repayment', () => {
    expect(payloadForUpdate(expense(), null)).toEqual(expense());
    const repayment = { ...expense(), kind: 'repayment' as const, debtId: 3 };
    expect(payloadForUpdate(repayment, 3)).toEqual(repayment);
    const unlinked = { ...repayment, debtId: null };
    expect(payloadForUpdate(unlinked, 3)).toEqual(unlinked);
  });
});
