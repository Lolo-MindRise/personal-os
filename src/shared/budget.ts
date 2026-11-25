import type { BudgetMonthDto, BudgetRowDto } from './api.js';
import type { Kind } from './constants.js';

// Pure budget logic, shared by the API and tested without a database.

export interface BudgetCategory {
  id: number;
  name: string;
  kind: Kind;
}

export interface BudgetLineInput {
  categoryId: number;
  amountCents: number;
  /** `YYYY-MM`. */
  validFrom: string;
}

/**
 * The line in effect for a category in a month: the latest `validFrom` that is
 * not after the month. Months compare as text because they are zero-padded ISO.
 */
export function lineInEffect(
  lines: BudgetLineInput[],
  categoryId: number,
  month: string,
): BudgetLineInput | undefined {
  let best: BudgetLineInput | undefined;
  for (const line of lines) {
    if (
      line.categoryId === categoryId &&
      line.validFrom <= month &&
      (best === undefined || line.validFrom > best.validFrom)
    ) {
      best = line;
    }
  }
  return best;
}

/**
 * One row per expense category, plus any other category that has a budget in
 * effect that month (a budget on an income category would otherwise be invisible).
 * Totals only add the expense rows. Rows are ordered by name. `actualByCategory` holds confirmed movement totals.
 */
export function buildBudgetMonth(
  month: string,
  categories: BudgetCategory[],
  lines: BudgetLineInput[],
  actualByCategory: ReadonlyMap<number, number>,
): BudgetMonthDto {
  const rows: BudgetRowDto[] = [];
  for (const category of categories) {
    const line = lineInEffect(lines, category.id, month);
    if (category.kind !== 'expense' && line === undefined) {
      continue;
    }
    const actualCents = actualByCategory.get(category.id) ?? 0;
    rows.push({
      categoryId: category.id,
      categoryName: category.name,
      kind: category.kind,
      budgetCents: line?.amountCents ?? null,
      budgetFrom: line?.validFrom ?? null,
      actualCents,
      differenceCents: line === undefined ? null : line.amountCents - actualCents,
    });
  }
  rows.sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'es'));
  // Totals cover expense rows only: income and repayment amounts are positive too, and adding
  // them to spending would make the totals meaningless.
  const expenseRows = rows.filter((r) => r.kind === 'expense');
  const budgetCents = expenseRows.reduce((sum, r) => sum + (r.budgetCents ?? 0), 0);
  const actualCents = expenseRows.reduce((sum, r) => sum + r.actualCents, 0);
  return {
    month,
    rows,
    totals: { budgetCents, actualCents, differenceCents: budgetCents - actualCents },
  };
}

/** Share of the budget spent from which a category is flagged, and the share that is "over". */
export const BUDGET_WARNING_PERCENT = 80;
export const BUDGET_OVER_PERCENT = 100;

export type BudgetAlertState = 'none' | 'ok' | 'warning' | 'over';

export interface BudgetAlert {
  state: BudgetAlertState;
  /** Whole percent of the budget spent (rounded down); null when there is nothing to compare. */
  percent: number | null;
}

/**
 * How close a category is to its monthly budget, in integer cents (no floats). No budget, or a
 * budget of 0, gives `none` (no alert). Below 80 %: `ok`; from 80 % up to but excluding 100 %:
 * `warning`; from 100 %: `over`. The percentage can exceed 100.
 */
export function budgetAlert(budgetCents: number | null, actualCents: number): BudgetAlert {
  if (budgetCents === null || budgetCents <= 0) {
    return { state: 'none', percent: null };
  }
  const spent = Math.max(0, actualCents);
  const percent = Math.floor((spent * 100) / budgetCents);
  // Deliberate: at exactly 100 % the state is `over` (budget reached), whereas the dashboard
  // chart flag `overBudget` is strictly above budget. Do not align one with the other.
  const state: BudgetAlertState =
    spent * 100 >= BUDGET_OVER_PERCENT * budgetCents
      ? 'over'
      : spent * 100 >= BUDGET_WARNING_PERCENT * budgetCents
        ? 'warning'
        : 'ok';
  return { state, percent };
}
