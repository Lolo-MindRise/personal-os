import type { RecurringItemDto } from '../shared/api.js';
import type { Kind } from '../shared/constants.js';
import { centsToInput, parseMoney } from '../shared/money.js';
import { isoMonth, kindSchema } from '../shared/schemas.js';
import { currentMonth } from './months.js';

/** What the user typed. Everything is text until `validateRecurringForm`. */
export interface RecurringFormValues {
  kind: Kind;
  categoryId: string;
  concept: string;
  amount: string;
  expectedDay: string;
  startMonth: string;
  /** Empty means "no end month". */
  endMonth: string;
  notes: string;
  /** The debt a repayment pays the installments of; '' means none. */
  debtId: string;
}

export type RecurringField = keyof RecurringFormValues;

export interface RecurringPayload {
  kind: Kind;
  categoryId: number;
  concept: string;
  amountCents: number;
  expectedDay: number;
  startMonth: string;
  endMonth: string | null;
  notes: string | null;
  debtId: number | null;
}

export type RecurringFormResult =
  | { ok: true; payload: RecurringPayload }
  | { ok: false; errors: Partial<Record<RecurringField, string>> };

export const RECURRING_ERRORS = {
  kind: 'Elige un tipo.',
  categoryId: 'Elige una categoría.',
  concept: 'Escribe un concepto.',
  expectedDay: 'Introduce un día del mes, del 1 al 31.',
  startMonth: 'Elige el mes inicial.',
  endMonth: 'El mes final debe ser un mes válido.',
  endBeforeStart: 'El mes final no puede ser anterior al mes inicial.',
} as const;

export function emptyRecurringForm(month: string = currentMonth()): RecurringFormValues {
  return {
    kind: 'expense',
    categoryId: '',
    concept: '',
    amount: '',
    expectedDay: '1',
    startMonth: month,
    endMonth: '',
    notes: '',
    debtId: '',
  };
}

export function formFromItem(item: RecurringItemDto): RecurringFormValues {
  return {
    kind: item.kind,
    categoryId: String(item.categoryId),
    concept: item.concept,
    amount: centsToInput(item.amountCents),
    expectedDay: String(item.expectedDay),
    startMonth: item.startMonth,
    endMonth: item.endMonth ?? '',
    notes: item.notes ?? '',
    debtId: item.debtId === null ? '' : String(item.debtId),
  };
}

/** Validates the form in Spanish, field by field, and builds the API payload. */
export function validateRecurringForm(values: RecurringFormValues): RecurringFormResult {
  const errors: Partial<Record<RecurringField, string>> = {};

  if (!kindSchema.safeParse(values.kind).success) {
    errors.kind = RECURRING_ERRORS.kind;
  }
  const categoryId = Number(values.categoryId);
  if (values.categoryId === '' || !Number.isInteger(categoryId) || categoryId < 1) {
    errors.categoryId = RECURRING_ERRORS.categoryId;
  }
  const concept = values.concept.trim();
  if (concept === '') {
    errors.concept = RECURRING_ERRORS.concept;
  }
  const amount = parseMoney(values.amount);
  if (!amount.ok) {
    errors.amount = amount.error;
  }
  const dayText = values.expectedDay.trim();
  const expectedDay = Number(dayText);
  if (!/^\d{1,2}$/.test(dayText) || expectedDay < 1 || expectedDay > 31) {
    errors.expectedDay = RECURRING_ERRORS.expectedDay;
  }
  if (!isoMonth.safeParse(values.startMonth).success) {
    errors.startMonth = RECURRING_ERRORS.startMonth;
  }
  const endText = values.endMonth.trim();
  if (endText !== '') {
    if (!isoMonth.safeParse(endText).success) {
      errors.endMonth = RECURRING_ERRORS.endMonth;
    } else if (errors.startMonth === undefined && endText < values.startMonth) {
      errors.endMonth = RECURRING_ERRORS.endBeforeStart;
    }
  }

  if (Object.keys(errors).length > 0 || !amount.ok) {
    return { ok: false, errors };
  }
  const notes = values.notes.trim();
  return {
    ok: true,
    payload: {
      kind: values.kind,
      categoryId,
      concept,
      amountCents: amount.cents,
      expectedDay,
      startMonth: values.startMonth,
      endMonth: endText === '' ? null : endText,
      notes: notes === '' ? null : notes,
      // Only repayments carry a debt; the API rejects one on any other kind.
      debtId: values.kind === 'repayment' && values.debtId !== '' ? Number(values.debtId) : null,
    },
  };
}

const API_FIELD_TO_FORM: Record<string, RecurringField> = {
  kind: 'kind',
  categoryId: 'categoryId',
  concept: 'concept',
  amountCents: 'amount',
  expectedDay: 'expectedDay',
  startMonth: 'startMonth',
  endMonth: 'endMonth',
  notes: 'notes',
  debtId: 'debtId',
};

/** Maps the `fields` of an API error to form fields; unknown keys are dropped. */
export function mapRecurringApiErrors(
  fields: Record<string, string>,
): Partial<Record<RecurringField, string>> {
  const errors: Partial<Record<RecurringField, string>> = {};
  for (const [key, message] of Object.entries(fields)) {
    const field = API_FIELD_TO_FORM[key];
    if (field !== undefined) {
      errors[field] = message;
    }
  }
  return errors;
}
