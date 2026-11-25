import type { Kind } from '../shared/constants.js';
import { centsToInput, parseMoney } from '../shared/money.js';
import type { MovementDto, PendingEntryDto } from '../shared/api.js';
import {
  isoDate,
  kindSchema,
  MAX_TAG_LENGTH,
  MAX_TAGS_PER_MOVEMENT,
  tagKey,
} from '../shared/schemas.js';
import { todayISO } from './months.js';

/** What the user typed. Everything is text until `validateMovementForm`. */
export interface MovementFormValues {
  date: string;
  kind: Kind;
  categoryId: string;
  concept: string;
  amount: string;
  notes: string;
  /** The debt a repayment is linked to; '' means none. Only used when the kind is repayment. */
  debtId: string;
  /** The account; '' or absent means the default one ("Principal"), which the API applies. */
  accountId?: string;
  /** Tag names already chosen. Absent on a new movement; present (maybe empty) when editing. */
  tags?: string[];
  /** Text typed in the tag box and not yet turned into a tag (Enter or comma does that). */
  tagDraft?: string;
}

export type MovementField =
  'date' | 'kind' | 'categoryId' | 'concept' | 'amount' | 'notes' | 'debtId' | 'accountId' | 'tags';

/**
 * Adds the text of the tag box to the tags (several may come comma-separated). Names that
 * repeat one already there, ignoring case, are dropped. Returns the new values.
 */
export function commitTagDraft(values: MovementFormValues): MovementFormValues {
  const draft = values.tagDraft ?? '';
  const tags = [...(values.tags ?? [])];
  for (const part of draft.split(',')) {
    const name = part.trim();
    if (name !== '' && !tags.some((t) => tagKey(t) === tagKey(name))) {
      tags.push(name);
    }
  }
  return { ...values, tags, tagDraft: '' };
}

export function removeTag(values: MovementFormValues, name: string): MovementFormValues {
  return { ...values, tags: (values.tags ?? []).filter((t) => t !== name) };
}

export interface MovementPayload {
  date: string;
  kind: Kind;
  categoryId: number;
  concept: string;
  amountCents: number;
  notes: string | null;
  /** Present only on repayments: the linked debt, or null for none. */
  debtId?: number | null;
  /** Absent: the API uses the default account. */
  accountId?: number;
  /** Tag names; absent leaves the tags of a saved movement as they are. */
  tags?: string[];
}

export type FormResult =
  | { ok: true; payload: MovementPayload }
  | { ok: false; errors: Partial<Record<MovementField, string>> };

/**
 * What may be overridden when confirming a pending entry. Kind and category
 * always come from the recurring item, so they are not sent.
 */
export interface ConfirmPayload {
  date: string;
  amountCents: number;
  concept: string;
  notes: string | null;
  accountId?: number;
}

export function toConfirmPayload(payload: MovementPayload): ConfirmPayload {
  return {
    date: payload.date,
    amountCents: payload.amountCents,
    concept: payload.concept,
    notes: payload.notes,
    ...(payload.accountId === undefined ? {} : { accountId: payload.accountId }),
  };
}

export const FORM_ERRORS = {
  date: 'Introduce una fecha válida.',
  kind: 'Elige un tipo.',
  categoryId: 'Elige una categoría.',
  concept: 'Escribe un concepto.',
  tagLength: `Cada marca puede tener como máximo ${String(MAX_TAG_LENGTH)} caracteres.`,
  tagCount: `Un movimiento puede tener como máximo ${String(MAX_TAGS_PER_MOVEMENT)} marcas.`,
} as const;

export function emptyForm(today: string = todayISO()): MovementFormValues {
  return {
    date: today,
    kind: 'expense',
    categoryId: '',
    concept: '',
    amount: '',
    notes: '',
    debtId: '',
    accountId: '',
  };
}

export function formFromMovement(movement: MovementDto): MovementFormValues {
  return {
    accountId: String(movement.accountId),
    date: movement.date,
    kind: movement.kind,
    categoryId: String(movement.categoryId),
    concept: movement.concept,
    amount: centsToInput(movement.amountCents),
    notes: movement.notes ?? '',
    debtId: movement.debtId === null ? '' : String(movement.debtId),
    tags: [...movement.tags],
  };
}

/** Pre-fills the movement form with a pending entry's expected values. */
export function formFromEntry(entry: PendingEntryDto): MovementFormValues {
  return {
    date: entry.date,
    kind: entry.kind,
    categoryId: String(entry.categoryId),
    concept: entry.concept,
    amount: centsToInput(entry.amountCents),
    notes: entry.notes ?? '',
    debtId: '',
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
  // Text still in the tag box counts as a tag.
  const tags = commitTagDraft(values).tags ?? [];
  if (tags.some((t) => t.length > MAX_TAG_LENGTH)) {
    errors.tags = FORM_ERRORS.tagLength;
  } else if (tags.length > MAX_TAGS_PER_MOVEMENT) {
    errors.tags = FORM_ERRORS.tagCount;
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
      ...(values.tags === undefined && tags.length === 0 ? {} : { tags }),
      ...(values.accountId === undefined || values.accountId === ''
        ? {}
        : { accountId: Number(values.accountId) }),
      // Only repayments carry a debt; the API rejects one on any other kind.
      ...(values.kind === 'repayment'
        ? { debtId: values.debtId === '' ? null : Number(values.debtId) }
        : {}),
    },
  };
}

/**
 * The body of an edit. A repayment that had a debt and is turned into another
 * kind must say `debtId: null`, or the API (which merges with the stored row)
 * would refuse a debt on a non-repayment movement.
 */
export function payloadForUpdate(
  payload: MovementPayload,
  storedDebtId: number | null,
): MovementPayload {
  return payload.debtId === undefined && storedDebtId !== null
    ? { ...payload, debtId: null }
    : payload;
}

const API_FIELD_TO_FORM: Record<string, MovementField> = {
  date: 'date',
  kind: 'kind',
  categoryId: 'categoryId',
  concept: 'concept',
  amountCents: 'amount',
  notes: 'notes',
  debtId: 'debtId',
  accountId: 'accountId',
  tags: 'tags',
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
