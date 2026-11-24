import type { Kind } from '../shared/constants.js';
import { isoDate } from '../shared/schemas.js';
import { formatCents, parseMoney } from '../shared/money.js';

/** What the user typed in the filter panel. Everything is text until `validateFilters`. */
export interface FilterValues {
  q: string;
  /** A category id, or '' for any. */
  categoryId: string;
  /** A kind, or '' for any. */
  kind: Kind | '';
  from: string;
  to: string;
  /** Euros in Spanish format, or '' for no limit. */
  minAmount: string;
  maxAmount: string;
}

export type FilterField = keyof FilterValues;

/** The parsed filters, as the API wants them. Absent means "any". */
export interface SearchQuery {
  q?: string;
  categoryId?: number;
  /** Only set by links from the debts and fixed items screens, not by the filter panel. */
  debtId?: number;
  recurringItemId?: number;
  kind?: Kind;
  from?: string;
  to?: string;
  minAmountCents?: number;
  maxAmountCents?: number;
}

/** The API's limit for the text filter. */
export const MAX_TEXT_LENGTH = 100;

export const FILTER_ERRORS = {
  textLength: `El texto no puede superar los ${String(MAX_TEXT_LENGTH)} caracteres.`,
  date: 'La fecha no es válida.',
  dateOrder: 'La fecha final no puede ser anterior a la inicial.',
  amountOrder: 'El importe máximo no puede ser menor que el mínimo.',
} as const;

export function emptyFilters(): FilterValues {
  return { q: '', categoryId: '', kind: '', from: '', to: '', minAmount: '', maxAmount: '' };
}

export const FILTER_FIELDS: FilterField[] = [
  'q',
  'categoryId',
  'kind',
  'from',
  'to',
  'minAmount',
  'maxAmount',
];

/** True when at least one filter is filled in. */
export function hasFilters(values: FilterValues): boolean {
  return FILTER_FIELDS.some((field) => values[field].trim() !== '');
}

export type FilterResult =
  { ok: true; query: SearchQuery } | { ok: false; errors: Partial<Record<FilterField, string>> };

/** Validates the filter panel in Spanish, field by field, and builds the query. */
export function validateFilters(values: FilterValues): FilterResult {
  const errors: Partial<Record<FilterField, string>> = {};
  const query: SearchQuery = {};

  const q = values.q.trim();
  if (q.length > MAX_TEXT_LENGTH) {
    errors.q = FILTER_ERRORS.textLength;
  } else if (q !== '') {
    query.q = q;
  }
  if (values.categoryId !== '') {
    query.categoryId = Number(values.categoryId);
  }
  if (values.kind !== '') {
    query.kind = values.kind;
  }
  for (const field of ['from', 'to'] as const) {
    const text = values[field].trim();
    if (text === '') {
      continue;
    }
    if (isoDate.safeParse(text).success) {
      query[field] = text;
    } else {
      errors[field] = FILTER_ERRORS.date;
    }
  }
  if (query.from !== undefined && query.to !== undefined && query.to < query.from) {
    errors.to = FILTER_ERRORS.dateOrder;
  }
  for (const [field, key] of [
    ['minAmount', 'minAmountCents'],
    ['maxAmount', 'maxAmountCents'],
  ] as const) {
    const text = values[field].trim();
    if (text === '') {
      continue;
    }
    const parsed = parseMoney(text, { allowZero: true });
    if (parsed.ok) {
      query[key] = parsed.cents;
    } else {
      errors[field] = parsed.error;
    }
  }
  if (
    query.minAmountCents !== undefined &&
    query.maxAmountCents !== undefined &&
    query.maxAmountCents < query.minAmountCents
  ) {
    errors.maxAmount = FILTER_ERRORS.amountOrder;
  }
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, query };
}

/** The query string of a search request (only the filters that are set). */
export function searchParams(query: SearchQuery, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    params.set(key, String(value));
  }
  params.set('page', String(page));
  return params.toString();
}

/** A short description of the active filters, for the results header. */
export function describeFilters(
  query: SearchQuery,
  categoryName: string | undefined,
  kindLabels: Record<Kind, string>,
): string[] {
  const parts: string[] = [];
  if (query.q !== undefined) {
    parts.push(`texto «${query.q}»`);
  }
  if (query.categoryId !== undefined) {
    parts.push(`categoría ${categoryName ?? String(query.categoryId)}`);
  }
  if (query.debtId !== undefined) {
    parts.push('vinculados a una deuda');
  }
  if (query.recurringItemId !== undefined) {
    parts.push('confirmados desde un fijo');
  }
  if (query.kind !== undefined) {
    parts.push(`tipo ${kindLabels[query.kind].toLowerCase()}`);
  }
  if (query.from !== undefined) {
    parts.push(`desde ${query.from}`);
  }
  if (query.to !== undefined) {
    parts.push(`hasta ${query.to}`);
  }
  if (query.minAmountCents !== undefined) {
    parts.push(`importe desde ${formatCents(query.minAmountCents)}`);
  }
  if (query.maxAmountCents !== undefined) {
    parts.push(`importe hasta ${formatCents(query.maxAmountCents)}`);
  }
  return parts;
}
