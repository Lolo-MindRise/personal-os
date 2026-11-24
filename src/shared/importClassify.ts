// Pure classification of parsed CSV rows for the importer (task 0013, block 2): which category
// each row gets, whether it duplicates an existing movement, and whether it confirms a pending
// recurring item. The server loads the data; this module only decides.

import type { CategoryRuleDto, ImportPreviewRowDto, PendingEntryDto } from './api.js';
import type { Kind } from './constants.js';

export interface ClassifyInput {
  date: string;
  concept: string;
  /** Signed: negative is an expense (or repayment), positive an income. Never zero. */
  amountCents: number;
}

export interface ExistingMovement {
  date: string;
  concept: string;
  kind: Kind;
  /** Positive, as stored. */
  amountCents: number;
}

export interface ClassifyContext {
  /** Rules in the order they apply: the first matching one wins. */
  rules: CategoryRuleDto[];
  /** Movements already in the database around the file's dates. */
  existing: ExistingMovement[];
  /** Pending (due, not confirmed, not skipped) recurring entries of the months in the file. */
  pending: PendingEntryDto[];
}

/** Lower case, no accents, single spaces: how concepts and rule patterns are compared. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Kinds a signed amount can have: money out is an expense or a repayment, money in is income. */
export function kindsForAmount(amountCents: number): Kind[] {
  return amountCents < 0 ? ['expense', 'repayment'] : ['income'];
}

const duplicateKey = (date: string, outgoing: boolean, amountCents: number, concept: string) =>
  `${date}|${outgoing ? 'out' : 'in'}|${String(Math.abs(amountCents))}|${normalizeText(concept)}`;

/** The day of a `YYYY-MM-DD` date, for choosing the pending entry closest to a row. */
const dayOf = (date: string) => Number(date.slice(8, 10));

/**
 * Classifies rows in file order.
 * - Duplicate: an existing movement with the same date, amount and concept (ignoring case,
 *   accents and spacing). Each existing movement covers one row, so two identical rows against
 *   one stored movement flag only the first.
 * - Category: the first rule whose text the concept contains and whose category kind fits the sign.
 * - Recurring: a non-duplicate row matches a pending entry of its month with the same amount and
 *   a fitting kind (the rule's category kind when a rule matched, otherwise any kind the sign allows).
 *   The closest expected day wins; each pending entry is used once. The row then confirms that
 *   item, with the item's kind and category and the row's own date, amount and concept.
 */
export function classifyRows(
  rows: ClassifyInput[],
  context: ClassifyContext,
): ImportPreviewRowDto[] {
  const stored = new Map<string, number>();
  for (const m of context.existing) {
    const key = duplicateKey(m.date, m.kind !== 'income', m.amountCents, m.concept);
    stored.set(key, (stored.get(key) ?? 0) + 1);
  }
  const rules = context.rules.map((rule) => ({ rule, pattern: normalizeText(rule.pattern) }));
  const used = new Set<string>();

  return rows.map((row): ImportPreviewRowDto => {
    const kinds = kindsForAmount(row.amountCents);
    const concept = normalizeText(row.concept);
    const matched = rules.find(
      ({ rule, pattern }) =>
        pattern !== '' && kinds.includes(rule.kind) && concept.includes(pattern),
    )?.rule;
    const base = {
      date: row.date,
      concept: row.concept,
      amountCents: row.amountCents,
      kind: matched?.kind ?? (row.amountCents < 0 ? ('expense' as const) : ('income' as const)),
      categoryId: matched?.categoryId ?? null,
      categoryName: matched?.categoryName ?? null,
      ruleId: matched?.id ?? null,
      recurringItemId: null,
      recurringConcept: null,
    };

    const key = duplicateKey(row.date, row.amountCents < 0, row.amountCents, row.concept);
    const remaining = stored.get(key) ?? 0;
    if (remaining > 0) {
      stored.set(key, remaining - 1);
      return { ...base, status: 'duplicate' };
    }

    const month = row.date.slice(0, 7);
    const candidate = context.pending
      .filter(
        (entry) =>
          entry.month === month &&
          entry.amountCents === Math.abs(row.amountCents) &&
          (matched === undefined ? kinds.includes(entry.kind) : entry.kind === matched.kind) &&
          !used.has(`${String(entry.recurringItemId)}|${month}`),
      )
      .sort(
        (a, b) =>
          Math.abs(dayOf(a.date) - dayOf(row.date)) - Math.abs(dayOf(b.date) - dayOf(row.date)) ||
          a.recurringItemId - b.recurringItemId,
      )[0];
    if (candidate !== undefined) {
      used.add(`${String(candidate.recurringItemId)}|${month}`);
      return {
        ...base,
        kind: candidate.kind,
        categoryId: candidate.categoryId,
        categoryName: candidate.categoryName,
        status: 'recurring',
        recurringItemId: candidate.recurringItemId,
        recurringConcept: candidate.concept,
      };
    }
    return { ...base, status: base.categoryId === null ? 'noCategory' : 'new' };
  });
}
