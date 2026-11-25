import { KINDS, type Kind } from '../shared/constants.js';
import { isoDate } from '../shared/schemas.js';
import { formatCents, parseMoney } from '../shared/money.js';

/** What the user typed in the filter panel. Everything is text until `validateFilters`. */
export interface FilterValues {
  q: string;
  /** A category id, or '' for any. */
  categoryId: string;
  /** A kind, or '' for any. */
  kind: Kind | '';
  /** Tag ids joined by commas ('' for any). A movement must have all of them. */
  tagIds: string;
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
  tagIds?: number[];
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
  return {
    q: '',
    categoryId: '',
    kind: '',
    tagIds: '',
    from: '',
    to: '',
    minAmount: '',
    maxAmount: '',
  };
}

export const FILTER_FIELDS: FilterField[] = [
  'q',
  'categoryId',
  'kind',
  'tagIds',
  'from',
  'to',
  'minAmount',
  'maxAmount',
];

/** True when at least one filter is filled in. */
export function hasFilters(values: FilterValues): boolean {
  return FILTER_FIELDS.some((field) => values[field].trim() !== '');
}

/** At most this many tags in one filter (the API's limit). */
export const MAX_TAG_FILTERS = 20;

/**
 * Tag ids from a comma list: valid ids only, no repeats, at most MAX_TAG_FILTERS; undefined when
 * none is left. Anything else in the text is ignored one by one.
 */
export function parseTagIds(text: string | undefined): number[] | undefined {
  const ids = [
    ...new Set(
      (text ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter((part) => /^[1-9]\d{0,9}$/.test(part))
        .map(Number),
    ),
  ].slice(0, MAX_TAG_FILTERS);
  return ids.length > 0 ? ids : undefined;
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
  const tagIds = parseTagIds(values.tagIds);
  if (tagIds !== undefined) {
    query.tagIds = tagIds;
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

/**
 * URL parameter of each panel filter. `cat`, not `category`: `category` is the month filter
 * that links from the dashboard put in the URL.
 */
export const URL_KEYS = {
  q: 'q',
  categoryId: 'cat',
  kind: 'kind',
  tagIds: 'tag',
  from: 'from',
  to: 'to',
  minAmountCents: 'min',
  maxAmountCents: 'max',
} as const;

/** Every URL parameter the panel owns (to clear them when the search changes or ends). */
export const SEARCH_URL_KEYS: string[] = Object.values(URL_KEYS);

/** The panel's query as URL params (amounts as integer cents). Debt and fixed links are not included. */
export function queryToParams(query: SearchQuery): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [field, key] of Object.entries(URL_KEYS) as [keyof typeof URL_KEYS, string][]) {
    const value = query[field];
    if (value !== undefined) {
      params[key] = String(value);
    }
  }
  return params;
}

/** Any amount `parseMoney` accepts (up to Number.MAX_SAFE_INTEGER cents) survives a reload. */
const isCents = (text: string | undefined): text is string =>
  text !== undefined && /^\d{1,16}$/.test(text) && Number.isSafeInteger(Number(text));

export type SearchAction = 'rerun' | 'navigate' | 'clear-url' | 'run-in-place';

/**
 * What "Buscar" must do given the search held by the URL (if any) and the validated query:
 * same filters re-run without a new history entry; a different non-empty search is pushed to the
 * URL; an empty search drops the search params from a URL that holds one, or runs in place.
 */
export function searchAction(urlQuery: SearchQuery | undefined, query: SearchQuery): SearchAction {
  const next = queryToParams(query);
  if (urlQuery !== undefined && JSON.stringify(queryToParams(urlQuery)) === JSON.stringify(next)) {
    return 'rerun';
  }
  if (Object.keys(next).length > 0) {
    return 'navigate';
  }
  return urlQuery !== undefined ? 'clear-url' : 'run-in-place';
}

/**
 * Reads the panel's filters back from URL params. Invalid or unknown values are ignored one by
 * one, never thrown. Returns undefined when no valid filter is left (no search).
 */
export function paramsToQuery(params: Record<string, string>): SearchQuery | undefined {
  const query: SearchQuery = {};
  const q = params[URL_KEYS.q]?.trim();
  if (q !== undefined && q !== '' && q.length <= MAX_TEXT_LENGTH) {
    query.q = q;
  }
  const cat = params[URL_KEYS.categoryId];
  if (cat !== undefined && /^[1-9]\d{0,9}$/.test(cat)) {
    query.categoryId = Number(cat);
  }
  const kind = KINDS.find((k) => k === params[URL_KEYS.kind]);
  if (kind !== undefined) {
    query.kind = kind;
  }
  const tagIds = parseTagIds(params[URL_KEYS.tagIds]);
  if (tagIds !== undefined) {
    query.tagIds = tagIds;
  }
  for (const field of ['from', 'to'] as const) {
    const text = params[URL_KEYS[field]];
    if (text !== undefined && isoDate.safeParse(text).success) {
      query[field] = text;
    }
  }
  if (query.from !== undefined && query.to !== undefined && query.to < query.from) {
    delete query.to;
  }
  const min = params[URL_KEYS.minAmountCents];
  if (isCents(min)) {
    query.minAmountCents = Number(min);
  }
  const max = params[URL_KEYS.maxAmountCents];
  if (isCents(max)) {
    query.maxAmountCents = Number(max);
  }
  if (
    query.minAmountCents !== undefined &&
    query.maxAmountCents !== undefined &&
    query.maxAmountCents < query.minAmountCents
  ) {
    delete query.maxAmountCents;
  }
  return Object.keys(query).length > 0 ? query : undefined;
}

const euros = (cents: number) =>
  `${String(Math.floor(cents / 100))},${String(cents % 100).padStart(2, '0')}`;

/** The panel's text fields for a query (the inverse of `validateFilters`). */
export function queryToFilters(query: SearchQuery): FilterValues {
  return {
    q: query.q ?? '',
    categoryId: query.categoryId === undefined ? '' : String(query.categoryId),
    kind: query.kind ?? '',
    tagIds: query.tagIds?.join(',') ?? '',
    from: query.from ?? '',
    to: query.to ?? '',
    minAmount: query.minAmountCents === undefined ? '' : euros(query.minAmountCents),
    maxAmount: query.maxAmountCents === undefined ? '' : euros(query.maxAmountCents),
  };
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
  tagNames: ReadonlyMap<number, string> = new Map(),
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
  // A tag that no longer exists is ignored by the search, so it is not listed either.
  const marks = (query.tagIds ?? []).flatMap((id) => tagNames.get(id) ?? []);
  if (marks.length > 0) {
    parts.push(`${marks.length === 1 ? 'marca' : 'marcas'} ${marks.join(' y ')}`);
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
