import type { DebtDto } from '../shared/api.js';
import { parseRate, rateToInput } from '../shared/debts.js';
import { centsToInput, parseMoney } from '../shared/money.js';
import { isoDate } from '../shared/schemas.js';
import { todayISO } from './months.js';

/** What the user typed. Everything is text until `validateDebtForm`. */
export interface DebtFormValues {
  name: string;
  monthlyPayment: string;
  balance: string;
  balanceAsOf: string;
  remainingInstallments: string;
  /** Annual rate in percent, as typed (`6,5`). */
  rate: string;
  notes: string;
}

export type DebtField = keyof DebtFormValues;

export interface DebtPayload {
  name: string;
  monthlyPaymentCents: number;
  balanceCents: number;
  balanceAsOf: string;
  remainingInstallments: number;
  annualRateBps: number;
  notes: string | null;
}

export type DebtFormResult =
  { ok: true; payload: DebtPayload } | { ok: false; errors: Partial<Record<DebtField, string>> };

export const DEBT_ERRORS = {
  name: 'Escribe un nombre.',
  balanceAsOf: 'Introduce una fecha válida para el saldo.',
  installments: 'Introduce un número de cuotas, 0 o más.',
} as const;

export function emptyDebtForm(today: string = todayISO()): DebtFormValues {
  return {
    name: '',
    monthlyPayment: '',
    balance: '',
    balanceAsOf: today,
    remainingInstallments: '',
    rate: '',
    notes: '',
  };
}

export function formFromDebt(debt: DebtDto): DebtFormValues {
  return {
    name: debt.name,
    monthlyPayment: centsToInput(debt.monthlyPaymentCents),
    balance: centsToInput(debt.balanceCents),
    balanceAsOf: debt.balanceAsOf,
    remainingInstallments: String(debt.remainingInstallments),
    rate: rateToInput(debt.annualRateBps),
    notes: debt.notes ?? '',
  };
}

/** Validates the form in Spanish, field by field, and builds the API payload. */
export function validateDebtForm(values: DebtFormValues): DebtFormResult {
  const errors: Partial<Record<DebtField, string>> = {};

  const name = values.name.trim();
  if (name === '') {
    errors.name = DEBT_ERRORS.name;
  }
  const monthly = parseMoney(values.monthlyPayment);
  if (!monthly.ok) {
    errors.monthlyPayment = monthly.error;
  }
  // A paid-off debt has a balance of zero.
  const balance = parseMoney(values.balance, { allowZero: true });
  if (!balance.ok) {
    errors.balance = balance.error;
  }
  if (!isoDate.safeParse(values.balanceAsOf).success) {
    errors.balanceAsOf = DEBT_ERRORS.balanceAsOf;
  }
  const installmentsText = values.remainingInstallments.trim();
  if (!/^\d{1,4}$/.test(installmentsText)) {
    errors.remainingInstallments = DEBT_ERRORS.installments;
  }
  const rate = parseRate(values.rate);
  if (!rate.ok) {
    errors.rate = rate.error;
  }

  if (Object.keys(errors).length > 0 || !monthly.ok || !balance.ok || !rate.ok) {
    return { ok: false, errors };
  }
  const notes = values.notes.trim();
  return {
    ok: true,
    payload: {
      name,
      monthlyPaymentCents: monthly.cents,
      balanceCents: balance.cents,
      balanceAsOf: values.balanceAsOf,
      remainingInstallments: Number(installmentsText),
      annualRateBps: rate.bps,
      notes: notes === '' ? null : notes,
    },
  };
}

const API_FIELD_TO_FORM: Record<string, DebtField> = {
  name: 'name',
  monthlyPaymentCents: 'monthlyPayment',
  balanceCents: 'balance',
  balanceAsOf: 'balanceAsOf',
  remainingInstallments: 'remainingInstallments',
  annualRateBps: 'rate',
  notes: 'notes',
};

/** Maps the `fields` of an API error to form fields; unknown keys are dropped. */
export function mapDebtApiErrors(
  fields: Record<string, string>,
): Partial<Record<DebtField, string>> {
  const errors: Partial<Record<DebtField, string>> = {};
  for (const [key, message] of Object.entries(fields)) {
    const field = API_FIELD_TO_FORM[key];
    if (field !== undefined) {
      errors[field] = message;
    }
  }
  return errors;
}

/**
 * Editing the balance records a new as-of date (today, unless the user already
 * changed the date). Returns the next values after a field change.
 */
export function applyDebtChange(
  current: DebtFormValues,
  next: DebtFormValues,
  original: DebtFormValues | undefined,
  today: string = todayISO(),
): DebtFormValues {
  const balanceEdited = next.balance !== current.balance;
  const dateUntouched = next.balanceAsOf === current.balanceAsOf;
  if (
    original !== undefined &&
    balanceEdited &&
    dateUntouched &&
    next.balanceAsOf === original.balanceAsOf &&
    next.balance !== original.balance
  ) {
    return { ...next, balanceAsOf: today > original.balanceAsOf ? today : original.balanceAsOf };
  }
  return next;
}
