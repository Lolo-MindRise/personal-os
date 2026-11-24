import type { Kind } from '../shared/constants.js';
import { centsToInput, parseMoney } from '../shared/money.js';
import type { MovementDto } from '../shared/api.js';
import { isoDate, kindSchema } from '../shared/schemas.js';
import { todayISO } from './months.js';

/** What the user typed. Everything is text until `validateMovementForm`. */
export interface MovementFormValues {
  date: string;
  kind: Kind;
  categoryId: string;
  concept: string;
  amount: string;
  notes: string;
}

export type MovementField = 'date' | 'kind' | 'categoryId' | 'concept' | 'amount' | 'notes';

export interface MovementPayload {
  date: string;
  kind: Kind;
  categoryId: number;
  concept: string;
  amountCents: number;
  notes: string | null;
}

export type FormResult =
  | { ok: true; payload: MovementPayload }
  | { ok: false; errors: Partial<Record<MovementField, string>> };

export const FORM_ERRORS = {
  date: 'Introduce una fecha válida.',
  kind: 'Elige un tipo.',
  categoryId: 'Elige una categoría.',
  concept: 'Escribe un concepto.',
} as const;

export function emptyForm(today: string = todayISO()): MovementFormValues {
  return { date: today, kind: 'expense', categoryId: '', concept: '', amount: '', notes: '' };
}

export function formFromMovement(movement: MovementDto): MovementFormValues {
  return {
    date: movement.date,
    kind: movement.kind,
    categoryId: String(movement.categoryId),
    concept: movement.concept,
    amount: centsToInput(movement.amountCents),
    notes: movement.notes ?? '',
  };
}

/** Validates the form in Spanish, field by field, and builds the API payload. */
export function validateMovementForm(values: MovementFormValues): FormResult {
  const errors: Partial<Record<MovementField, string>> = {};

  if (!isoDate.safeParse(values.date).success) {
    errors.date = FORM_ERRORS.date;
  }
  if (!kindSchema.safeParse(values.kind).success) {
    errors.kind = FORM_ERRORS.kind;
  }
  const categoryId = Number(values.categoryId);
  if (values.categoryId === '' || !Number.isInteger(categoryId) || categoryId < 1) {
    errors.categoryId = FORM_ERRORS.categoryId;
  }
  const concept = values.concept.trim();
  if (concept === '') {
    errors.concept = FORM_ERRORS.concept;
  }
  const amount = parseMoney(values.amount);
  if (!amount.ok) {
    errors.amount = amount.error;
  }

  if (Object.keys(errors).length > 0 || !amount.ok) {
    return { ok: false, errors };
  }
  const notes = values.notes.trim();
  return {
    ok: true,
    payload: {
      date: values.date,
      kind: values.kind,
      categoryId,
      concept,
      amountCents: amount.cents,
      notes: notes === '' ? null : notes,
    },
  };
}

const API_FIELD_TO_FORM: Record<string, MovementField> = {
  date: 'date',
  kind: 'kind',
  categoryId: 'categoryId',
  concept: 'concept',
  amountCents: 'amount',
  notes: 'notes',
};

/** Maps the `fields` of an API error to form fields; unknown keys are dropped. */
export function mapApiFieldErrors(
  fields: Record<string, string>,
): Partial<Record<MovementField, string>> {
  const errors: Partial<Record<MovementField, string>> = {};
  for (const [key, message] of Object.entries(fields)) {
    const field = API_FIELD_TO_FORM[key];
    if (field !== undefined) {
      errors[field] = message;
    }
  }
  return errors;
}

/**
 * A message for API errors on fields the form does not have (for example
 * `debtId`), so the user still learns why a save was rejected.
 */
export function unmappedApiMessage(fields: Record<string, string>): string | undefined {
  return Object.entries(fields).find(([key]) => !(key in API_FIELD_TO_FORM))?.[1];
}
