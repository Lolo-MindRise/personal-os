import { and, asc, eq, gte, isNotNull, lte } from 'drizzle-orm';
import type { PendingEntryDto, RecurringItemDto } from '../../shared/api.js';
import { expectedDate, isDueInMonth } from '../../shared/recurring.js';
import type { Db } from './index.js';
import { categories, movements, recurringItems, recurringSkips } from './schema.js';

const itemColumns = {
  id: recurringItems.id,
  kind: recurringItems.kind,
  categoryId: recurringItems.categoryId,
  categoryName: categories.name,
  concept: recurringItems.concept,
  amountCents: recurringItems.amountCents,
  expectedDay: recurringItems.expectedDay,
  startMonth: recurringItems.startMonth,
  endMonth: recurringItems.endMonth,
  notes: recurringItems.notes,
};

export function getRecurringItem(db: Db, id: number): RecurringItemDto | undefined {
  return db
    .select(itemColumns)
    .from(recurringItems)
    .innerJoin(categories, eq(categories.id, recurringItems.categoryId))
    .where(eq(recurringItems.id, id))
    .get();
}

export function listRecurringItems(db: Db): RecurringItemDto[] {
  return db
    .select(itemColumns)
    .from(recurringItems)
    .innerJoin(categories, eq(categories.id, recurringItems.categoryId))
    .orderBy(asc(recurringItems.expectedDay), asc(recurringItems.concept), asc(recurringItems.id))
    .all();
}

/** Ids of the items that have a confirmed movement dated in the month. */
export function confirmedItemIds(db: Db, month: string): Set<number> {
  const rows = db
    .select({ id: movements.recurringItemId })
    .from(movements)
    .where(
      and(
        isNotNull(movements.recurringItemId),
        gte(movements.date, `${month}-01`),
        lte(movements.date, `${month}-31`),
      ),
    )
    .all();
  return new Set(rows.flatMap((row) => (row.id === null ? [] : [row.id])));
}

export function skippedItemIds(db: Db, month: string): Set<number> {
  const rows = db
    .select({ id: recurringSkips.recurringItemId })
    .from(recurringSkips)
    .where(eq(recurringSkips.month, month))
    .all();
  return new Set(rows.map((row) => row.id));
}

export function toEntry(item: RecurringItemDto, month: string): PendingEntryDto {
  return {
    recurringItemId: item.id,
    month,
    date: expectedDate(month, item.expectedDay),
    kind: item.kind,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    concept: item.concept,
    amountCents: item.amountCents,
    notes: item.notes,
  };
}

export interface DueEntries {
  /** Due, not confirmed, not skipped. */
  pending: PendingEntryDto[];
  /** Due, not confirmed, skipped (kept so a skip can be undone). */
  skipped: PendingEntryDto[];
}

/**
 * A month's entries, computed on read (ADR-0005): items due that month
 * (start month to end month, both included) without a confirmed movement.
 * Ordered by expected date. Past months keep showing unconfirmed items.
 */
export function dueEntries(db: Db, month: string): DueEntries {
  const confirmed = confirmedItemIds(db, month);
  const skipped = skippedItemIds(db, month);
  const pending: PendingEntryDto[] = [];
  const skippedEntries: PendingEntryDto[] = [];
  for (const item of listRecurringItems(db)) {
    if (!isDueInMonth(item, month) || confirmed.has(item.id)) {
      continue;
    }
    (skipped.has(item.id) ? skippedEntries : pending).push(toEntry(item, month));
  }
  const byDate = (a: PendingEntryDto, b: PendingEntryDto) =>
    a.date.localeCompare(b.date) || a.recurringItemId - b.recurringItemId;
  return { pending: pending.sort(byDate), skipped: skippedEntries.sort(byDate) };
}
