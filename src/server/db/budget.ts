import { and, desc, eq, lte } from 'drizzle-orm';
import type { Db } from './index.js';
import { budgetLines } from './schema.js';

export type BudgetLine = typeof budgetLines.$inferSelect;

/**
 * The budget line in force for a category in a month (YYYY-MM): the line with
 * the latest `valid_from` that is not after that month. Months compare
 * correctly as text because they are zero-padded ISO.
 */
export function budgetForMonth(db: Db, categoryId: number, month: string): BudgetLine | undefined {
  return db
    .select()
    .from(budgetLines)
    .where(and(eq(budgetLines.categoryId, categoryId), lte(budgetLines.validFrom, month)))
    .orderBy(desc(budgetLines.validFrom))
    .limit(1)
    .get();
}
