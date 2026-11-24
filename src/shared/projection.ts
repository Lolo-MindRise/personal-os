// Pure projection arithmetic (task 0013, block 4), shared by the API and the page. Nothing here
// touches the database or the clock; the server gathers the inputs and the page applies scenarios.

import type { ProjectionMonthDto } from './api.js';
import { lineInEffect, type BudgetLineInput } from './budget.js';
import type { Kind } from './constants.js';
import { isDueInMonth } from './recurring.js';
import { monthsBetween } from './summary.js';

export const MAX_PROJECTION_MONTHS = 120;

export interface ProjectionCategory {
  id: number;
  name: string;
  kind: Kind;
}

export interface ProjectionRecurring {
  id: number;
  kind: Kind;
  categoryId: number;
  amountCents: number;
  startMonth: string;
  endMonth: string | null;
}

export interface ProjectionInput {
  /** The first month projected (`YYYY-MM`): the month of today. */
  currentMonth: string;
  /** The last month projected, inclusive. */
  endMonth: string;
  /** Accumulated savings at the end of the month before `currentMonth`. */
  baselineCents: number;
  categories: ProjectionCategory[];
  recurring: ProjectionRecurring[];
  budgetLines: BudgetLineInput[];
  /**
   * Confirmed movements of the current month by category, in cents (movements already counted in
   * the initial balance are left out by the caller).
   */
  actualByCategory: ReadonlyMap<number, number>;
  /**
   * Items that must not be projected in a month because they are confirmed there (current month
   * only: already inside `actualByCategory`) or skipped.
   */
  settled: { itemId: number; month: string }[];
}

/** `'2026-12'` + 1 → `'2027-01'`. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const index = (y ?? 0) * 12 + ((m ?? 1) - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Every month from `from` to `to` inclusive; empty when `to` is earlier. */
export function monthRange(from: string, to: string): string[] {
  const count = monthsBetween(from, to) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, i) => addMonths(from, i));
}

/**
 * Projects each month from the current one to the end month.
 *
 * Per category and month:
 * - Recurring items due that month (start to end month, both included) count at their expected
 *   amount, unless they are settled (skipped, or already confirmed this month).
 * - An expense category with no recurring item due that month uses its budget in effect instead.
 *   Categories that have a recurring item never use their budget; income and repayment categories
 *   have no budget in the projection.
 * - In the current month, confirmed movements count as they are, pending items are added, and a
 *   budget only fills what is still missing (budget − actual, never below zero).
 *
 * Accumulated savings start from `baselineCents` and add each month's savings, which may be
 * negative. Months of every kind are integer cents.
 */
export function projectMonths(input: ProjectionInput): ProjectionMonthDto[] {
  const settled = new Set(input.settled.map((s) => `${String(s.itemId)}|${s.month}`));
  let accumulated = input.baselineCents;

  return monthRange(input.currentMonth, input.endMonth).map((month) => {
    const isCurrent = month === input.currentMonth;
    const byCategory: { categoryId: number; cents: number }[] = [];
    const totals: Record<Kind, number> = { income: 0, expense: 0, repayment: 0 };

    for (const category of input.categories) {
      const due = input.recurring.filter(
        (item) => item.categoryId === category.id && isDueInMonth(item, month),
      );
      const pending = due
        .filter((item) => !settled.has(`${String(item.id)}|${month}`))
        .reduce((sum, item) => sum + item.amountCents, 0);
      const actual = isCurrent ? (input.actualByCategory.get(category.id) ?? 0) : 0;
      let budget = 0;
      if (category.kind === 'expense' && due.length === 0) {
        const line = lineInEffect(input.budgetLines, category.id, month);
        budget =
          line === undefined
            ? 0
            : isCurrent
              ? Math.max(0, line.amountCents - actual)
              : line.amountCents;
      }
      const cents = actual + pending + budget;
      if (cents > 0) {
        byCategory.push({ categoryId: category.id, cents });
        totals[category.kind] += cents;
      }
    }
    const savingsCents = totals.income - totals.expense - totals.repayment;
    accumulated += savingsCents;
    return {
      month,
      incomeCents: totals.income,
      expenseCents: totals.expense,
      repaymentCents: totals.repayment,
      savingsCents,
      accumulatedCents: accumulated,
      byCategory,
    };
  });
}

/** An adjustment typed on the page. Scenarios are never stored. */
export type Scenario =
  /** From `fromMonth` on, monthly income changes by `amountCents` (negative lowers it). */
  | { type: 'income'; fromMonth: string; amountCents: number }
  /** From `fromMonth` on, the monthly total of an expense category becomes `amountCents` (may be 0). */
  | { type: 'category'; fromMonth: string; categoryId: number; amountCents: number };

/**
 * Applies scenarios to a base projection and recomputes the accumulated savings from the same
 * baseline. A scenario acts on every month from its `fromMonth` on, never before. Income
 * adjustments add up. For a category, the last scenario that applies to a month sets that month's
 * total (a later `fromMonth` overrides an earlier one; equal months follow the order given).
 */
export function applyScenarios(
  base: ProjectionMonthDto[],
  baselineCents: number,
  scenarios: Scenario[],
  categories: ProjectionCategory[],
): ProjectionMonthDto[] {
  const kindOf = new Map(categories.map((c) => [c.id, c.kind]));
  const ordered = scenarios
    .map((scenario, index) => ({ scenario, index }))
    .sort((a, b) => a.scenario.fromMonth.localeCompare(b.scenario.fromMonth) || a.index - b.index)
    .map((s) => s.scenario);
  let accumulated = baselineCents;

  return base.map((row) => {
    const totals: Record<Kind, number> = {
      income: row.incomeCents,
      expense: row.expenseCents,
      repayment: row.repaymentCents,
    };
    const overrides = new Map<number, number>();
    for (const scenario of ordered) {
      if (scenario.fromMonth > row.month) {
        continue;
      }
      if (scenario.type === 'income') {
        totals.income += scenario.amountCents;
      } else {
        overrides.set(scenario.categoryId, scenario.amountCents);
      }
    }
    const byCategory = row.byCategory.map((c) => ({ ...c }));
    for (const [categoryId, cents] of overrides) {
      const kind = kindOf.get(categoryId);
      if (kind === undefined) {
        continue;
      }
      const current = byCategory.find((c) => c.categoryId === categoryId);
      totals[kind] += cents - (current?.cents ?? 0);
      if (current !== undefined) {
        current.cents = cents;
      } else if (cents > 0) {
        byCategory.push({ categoryId, cents });
      }
    }
    const savingsCents = totals.income - totals.expense - totals.repayment;
    accumulated += savingsCents;
    return {
      month: row.month,
      incomeCents: totals.income,
      expenseCents: totals.expense,
      repaymentCents: totals.repayment,
      savingsCents,
      accumulatedCents: accumulated,
      byCategory: byCategory.filter((c) => c.cents > 0),
    };
  });
}

/** The first month whose accumulated savings reach `targetCents`, or undefined within the range. */
export function firstMonthReaching(
  months: ProjectionMonthDto[],
  targetCents: number,
): string | undefined {
  return months.find((m) => m.accumulatedCents >= targetCents)?.month;
}
