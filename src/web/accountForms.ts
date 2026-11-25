import type { AccountDto } from '../shared/api.js';
import type { AccountType } from '../shared/constants.js';
import { centsToInput, parseMoney } from '../shared/money.js';
import { isoDate } from '../shared/schemas.js';
import { todayISO } from './months.js';

// Pure form logic for the Cuentas screen: values as typed in, payloads for the API.

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Cuenta bancaria',
  cash: 'Efectivo',
  savings: 'Ahorro',
};

export interface AccountFormValues {
  name: string;
  type: AccountType;
  /** Euros as typed; may be negative. */
  openingBalance: string;
  openingDate: string;
}

export interface AccountPayload {
  name: string;
  type: AccountType;
  openingBalanceCents: number;
  openingBalanceDate: string;
}

export const emptyAccountForm = (today: string = todayISO()): AccountFormValues => ({
  name: '',
  type: 'bank',
  openingBalance: '0',
  openingDate: today,
});

export const accountToForm = (a: AccountDto): AccountFormValues => ({
  name: a.name,
  type: a.type,
  openingBalance: `${a.openingBalanceCents < 0 ? '-' : ''}${centsToInput(a.openingBalanceCents)}`,
  openingDate: a.openingBalanceDate,
});

export type FormResult<P> =
  { ok: true; payload: P } | { ok: false; errors: Record<string, string> };

/** Parses a signed euro amount: a leading minus is allowed and zero is fine. */
export function parseSignedMoney(
  input: string,
): { ok: true; cents: number } | { ok: false; error: string } {
  const trimmed = input.trim();
  const negative = trimmed.startsWith('-');
  const parsed = parseMoney(negative ? trimmed.slice(1) : trimmed, { allowZero: true });
  if (!parsed.ok) {
    return parsed;
  }
  return { ok: true, cents: negative ? -parsed.cents : parsed.cents };
}

export function validateAccountForm(values: AccountFormValues): FormResult<AccountPayload> {
  const errors: Record<string, string> = {};
  const name = values.name.trim();
  if (name === '') {
    errors.name = 'Escribe un nombre.';
  }
  const balance = parseSignedMoney(values.openingBalance);
  if (!balance.ok) {
    errors.openingBalance = balance.error;
  }
  const date = isoDate.safeParse(values.openingDate);
  if (!date.success) {
    errors.openingDate = 'Elige una fecha válida.';
  }
  if (!balance.ok || !date.success || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    payload: {
      name,
      type: values.type,
      openingBalanceCents: balance.cents,
      openingBalanceDate: values.openingDate,
    },
  };
}

export interface TransferFormValues {
  date: string;
  amount: string;
  fromAccountId: string;
  toAccountId: string;
  notes: string;
}

export interface TransferPayload {
  date: string;
  amountCents: number;
  fromAccountId: number;
  toAccountId: number;
  notes: string | null;
}

export const emptyTransferForm = (
  accounts: readonly AccountDto[],
  today: string = todayISO(),
): TransferFormValues => ({
  date: today,
  amount: '',
  fromAccountId: String(accounts[0]?.id ?? ''),
  toAccountId: String(accounts[1]?.id ?? ''),
  notes: '',
});

export function validateTransferForm(values: TransferFormValues): FormResult<TransferPayload> {
  const errors: Record<string, string> = {};
  const date = isoDate.safeParse(values.date);
  if (!date.success) {
    errors.date = 'Elige una fecha válida.';
  }
  const amount = parseMoney(values.amount);
  if (!amount.ok) {
    errors.amount = amount.error;
  }
  const from = Number(values.fromAccountId);
  const to = Number(values.toAccountId);
  if (!Number.isInteger(from) || from <= 0) {
    errors.fromAccountId = 'Elige la cuenta de origen.';
  }
  if (!Number.isInteger(to) || to <= 0) {
    errors.toAccountId = 'Elige la cuenta de destino.';
  } else if (to === from) {
    errors.toAccountId = 'La cuenta de origen y la de destino deben ser distintas.';
  }
  if (!amount.ok || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  const notes = values.notes.trim();
  return {
    ok: true,
    payload: {
      date: values.date,
      amountCents: amount.cents,
      fromAccountId: from,
      toAccountId: to,
      notes: notes === '' ? null : notes,
    },
  };
}
