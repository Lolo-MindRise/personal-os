import type { GoalDto, SettingsDto, YearSummaryDto, YearSummaryRowDto } from './api.js';
import type { Kind } from './constants.js';
import { daysInMonth } from './recurring.js';

// Pure yearly-summary and goal logic, shared by the API and tested without a database.

export interface SummaryMovement {
  /** `YYYY-MM-DD`. */
  date: string;
  kind: Kind;
  amountCents: number;
}

/** What a movement does to savings: income adds, expenses and repayments subtract. */
export function savingsDelta(movement: Pick<SummaryMovement, 'kind' | 'amountCents'>): number {
  return movement.kind === 'income' ? movement.amountCents : -movement.amountCents;
}

/**
 * Accumulated savings at the end of `date` (inclusive): the initial balance plus the savings of
 * every movement dated after the initial date, up to `date`. The initial balance is valid at the
 * end of its own day, so a movement on the initial date is already in it. Without an initial
 * date, every movement counts from the start.
 */
export function accumulatedAt(
  settings: SettingsDto,
  movements: SummaryMovement[],
  date: string,
): number {
  const from = settings.initialSavingsDate;
  let total = settings.initialSavingsCents;
  for (const m of movements) {
    if ((from === null || m.date > from) && m.date <= date) {
      total += savingsDelta(m);
    }
  }
  return total;
}

/** One row per month of `year`, plus the year's totals. */
export function buildYearSummary(
  year: number,
  settings: SettingsDto,
  movements: SummaryMovement[],
): YearSummaryDto {
  const rows: YearSummaryRowDto[] = [];
  for (let n = 1; n <= 12; n++) {
    const month = `${String(year).padStart(4, '0')}-${String(n).padStart(2, '0')}`;
    let incomeCents = 0;
    let expenseCents = 0;
    let repaymentCents = 0;
    for (const m of movements) {
      if (m.date.slice(0, 7) !== month) {
        continue;
      }
      if (m.kind === 'income') {
        incomeCents += m.amountCents;
      } else if (m.kind === 'expense') {
        expenseCents += m.amountCents;
      } else {
        repaymentCents += m.amountCents;
      }
    }
    const lastDay = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`;
    const before = settings.initialSavingsDate !== null && lastDay < settings.initialSavingsDate;
    rows.push({
      month,
      incomeCents,
      expenseCents,
      repaymentCents,
      savingsCents: incomeCents - expenseCents - repaymentCents,
      accumulatedCents: before ? null : accumulatedAt(settings, movements, lastDay),
    });
  }
  const sum = (pick: (r: YearSummaryRowDto) => number) => rows.reduce((t, r) => t + pick(r), 0);
  return {
    year,
    settings,
    rows,
    totals: {
      incomeCents: sum((r) => r.incomeCents),
      expenseCents: sum((r) => r.expenseCents),
      repaymentCents: sum((r) => r.repaymentCents),
      savingsCents: sum((r) => r.savingsCents),
    },
  };
}

/** Calendar months from `from` to `to` (`YYYY-MM`); negative when `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  const index = (month: string) => {
    const [y, m] = month.split('-').map(Number);
    return (y ?? 0) * 12 + (m ?? 1);
  };
  return index(to) - index(from);
}

export interface GoalInput {
  id: number;
  name: string;
  targetAmountCents: number;
  targetDate: string;
}

/**
 * Progress of a goal against the accumulated savings on `today` (`YYYY-MM-DD`).
 * - reached: nothing left to save.
 * - overdue: the target date is before today and money is still missing.
 * - open: the monthly saving needed is the remaining amount divided by the months left,
 *   counting the current month (at least one), rounded up to the cent.
 */
export function goalProgress(goal: GoalInput, accumulatedCents: number, today: string): GoalDto {
  const remainingCents = Math.max(0, goal.targetAmountCents - accumulatedCents);
  const saved = Math.min(Math.max(accumulatedCents, 0), goal.targetAmountCents);
  const progressPercent = Math.floor((saved * 100) / goal.targetAmountCents);
  const base = {
    id: goal.id,
    name: goal.name,
    targetAmountCents: goal.targetAmountCents,
    targetDate: goal.targetDate,
    accumulatedCents,
    progressPercent,
    remainingCents,
  };
  if (remainingCents === 0) {
    return { ...base, status: 'reached', monthsLeft: null, monthlyRequiredCents: null };
  }
  if (goal.targetDate < today) {
    return { ...base, status: 'overdue', monthsLeft: null, monthlyRequiredCents: null };
  }
  const monthsLeft = Math.max(1, monthsBetween(today.slice(0, 7), goal.targetDate.slice(0, 7)) + 1);
  return {
    ...base,
    status: 'open',
    monthsLeft,
    monthlyRequiredCents: Math.ceil(remainingCents / monthsLeft),
  };
}
