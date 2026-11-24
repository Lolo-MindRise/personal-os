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
  /** The fixed item this movement confirms, or null for an ordinary movement. */
  recurringItemId: number | null;
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

/** Why a row is flagged as a duplicate, shown next to its status. */
export const DUPLICATE_REASON = 'ya existe un movimiento igual';
export const CONFIRMED_FIXED_REASON = 'ya confirmado como fijo';

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
 * - Already confirmed as a fixed item (task 0014): when no pending entry matches, a stored
 *   movement of the same month that confirms a fixed item with the same amount and a fitting kind
 *   flags the row as a duplicate ("ya confirmado como fijo"). It is only checked after the two
 *   rules above, so a pending item still wins, and each stored movement covers one row.
 *
 * Order: exact duplicates are resolved for the whole file first, then the other rules run in file
 * order, so a stored movement is never claimed by a looser rule before the row that exactly
 * duplicates it.
 */
export function classifyRows(
  rows: ClassifyInput[],
  context: ClassifyContext,
): ImportPreviewRowDto[] {
  // Every stored movement covers at most one row, by whichever rule claims it first.
  const stored = context.existing.map((m) => ({
    ...m,
    key: duplicateKey(m.date, m.kind !== 'income', m.amountCents, m.concept),
    used: false,
  }));
  const rules = context.rules.map((rule) => ({ rule, pattern: normalizeText(rule.pattern) }));
  const used = new Set<string>();

  const prepared = rows.map((row) => {
    const kinds = kindsForAmount(row.amountCents);
    const concept = normalizeText(row.concept);
    const matched = rules.find(
      ({ rule, pattern }) =>
        pattern !== '' && kinds.includes(rule.kind) && concept.includes(pattern),
    )?.rule;
    const base: ImportPreviewRowDto = {
      date: row.date,
      concept: row.concept,
      amountCents: row.amountCents,
      kind: matched?.kind ?? (row.amountCents < 0 ? ('expense' as const) : ('income' as const)),
      categoryId: matched?.categoryId ?? null,
      categoryName: matched?.categoryName ?? null,
      ruleId: matched?.id ?? null,
      recurringItemId: null,
      recurringConcept: null,
      reason: null,
      status: 'new',
    };
    return { row, kinds, matched, base };
  });

  // Pass 1: exact duplicates for every row, before any other rule claims a stored movement. A
  // row that exactly matches a stored movement must get it, whatever the order of the file.
  const exact = prepared.map(({ row }) => {
    const key = duplicateKey(row.date, row.amountCents < 0, row.amountCents, row.concept);
    const same = stored.find((m) => !m.used && m.key === key);
    if (same !== undefined) {
      same.used = true;
    }
    return same !== undefined;
  });

  // Pass 2: the pending-item and already-confirmed-fixed-item rules, in file order.
  return prepared.map(({ row, kinds, matched, base }, index): ImportPreviewRowDto => {
    if (exact[index] === true) {
      return { ...base, status: 'duplicate', reason: DUPLICATE_REASON };
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
    // No pending item matches. If this month already has a movement confirming a fixed item with
    // the same kind and amount (confirmed by hand in Fijos, with the item's own concept and date),
    // this row is most likely that same payment: flag it instead of counting it twice.
    const confirmed = stored.find(
      (m) =>
        !m.used &&
        m.recurringItemId !== null &&
        m.date.slice(0, 7) === month &&
        m.amountCents === Math.abs(row.amountCents) &&
        (matched === undefined ? kinds.includes(m.kind) : m.kind === matched.kind),
    );
    if (confirmed !== undefined) {
      confirmed.used = true;
      return { ...base, status: 'duplicate', reason: CONFIRMED_FIXED_REASON };
    }
    return { ...base, status: base.categoryId === null ? 'noCategory' : 'new' };
  });
}
