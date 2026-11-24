import type {
  DashboardMilestoneDto,
  DashboardMonthDto,
  GoalDto,
  MilestoneDto,
  SettingsDto,
} from './api.js';
import { isOverdue } from './milestones.js';
import { buildYearSummary, type SummaryMovement } from './summary.js';

// Pure helpers of the home dashboard (task 0011). The figures themselves come from the
// existing calculations (summary, budget, debts, goals); this only selects and arranges.

const pad = (n: number) => String(n).padStart(2, '0');

/** The `count` months ending at `month` (inclusive), oldest first: `('2026-02', 3)` → Dec, Jan, Feb. */
export function monthsEnding(month: string, count = 12): string[] {
  const [year, mon] = month.split('-').map(Number);
  const last = (year ?? 0) * 12 + ((mon ?? 1) - 1);
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const index = last - i;
    months.push(`${String(Math.floor(index / 12)).padStart(4, '0')}-${pad((index % 12) + 1)}`);
  }
  return months;
}

/**
 * Yearly-summary rows for exactly these months. Reuses `buildYearSummary` for each year the
 * window touches, so a window across a year boundary matches the Resumen screen.
 */
export function monthRows(
  months: string[],
  settings: SettingsDto,
  movements: SummaryMovement[],
): DashboardMonthDto[] {
  const rowsByMonth = new Map<string, DashboardMonthDto>();
  for (const year of new Set(months.map((m) => Number(m.slice(0, 4))))) {
    for (const row of buildYearSummary(year, settings, movements).rows) {
      rowsByMonth.set(row.month, row);
    }
  }
  return months.flatMap((m) => {
    const row = rowsByMonth.get(m);
    return row === undefined ? [] : [row];
  });
}

/** The goal with the nearest target date that is today or later; null when there is none. */
export function nextGoal(goals: GoalDto[], today: string): GoalDto | null {
  let best: GoalDto | null = null;
  for (const goal of goals) {
    if (goal.targetDate >= today && (best === null || goal.targetDate < best.targetDate)) {
      best = goal;
    }
  }
  return best;
}

/** The next `count` milestones that are not done, earliest date first (so overdue ones lead). */
export function upcomingMilestones(
  milestones: MilestoneDto[],
  today: string,
  count = 3,
): DashboardMilestoneDto[] {
  return milestones
    .filter((m) => m.status !== 'done')
    .sort((a, b) => a.targetDate.localeCompare(b.targetDate) || a.id - b.id)
    .slice(0, count)
    .map((m) => ({ ...m, overdue: isOverdue(m, today) }));
}

/** Whole percent of the recorded balance repaid since its date; null without a baseline. */
export function debtProgressPercent(recordedBalanceCents: number, repaidSinceCents: number) {
  if (recordedBalanceCents <= 0) {
    return null;
  }
  const repaid = Math.min(Math.max(repaidSinceCents, 0), recordedBalanceCents);
  return Math.floor((repaid * 100) / recordedBalanceCents);
}
