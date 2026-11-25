import type {
  DashboardMilestoneDto,
  DashboardMonthDto,
  GoalDto,
  MilestoneDto,
  SettingsDto,
} from './api.js';
import { formatCents } from './money.js';
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

/** `'2026-01'` → `'2025-12'`. */
export function previousMonth(month: string): string {
  return monthsEnding(month, 2)[0] ?? month;
}

/** Last day of `month`: `'2026-02'` → `'2026-02-28'`. */
export function monthEnd(month: string): string {
  const day = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  return day.toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/**
 * Neutral month-over-month text for one figure, in integer cents: `+120,00 € respecto a
 * octubre`, `-50,00 € respecto a octubre`, `Sin cambios respecto a octubre`. Null (show
 * nothing) when either value is missing: no previous data means no comparison.
 */
export function monthChangeText(
  currentCents: number | null,
  previousCents: number | null,
  previousMonthIso: string,
): string | null {
  if (currentCents === null || previousCents === null) {
    return null;
  }
  const name = MONTH_NAMES[Number(previousMonthIso.slice(5, 7)) - 1] ?? previousMonthIso;
  const delta = currentCents - previousCents;
  if (delta === 0) {
    return `Sin cambios respecto a ${name}`;
  }
  return `${delta > 0 ? '+' : '-'}${formatCents(Math.abs(delta))} respecto a ${name}`;
}

/**
 * Same as `monthChangeText` for a progress in whole percent: `+5 puntos respecto a octubre`,
 * `+1 punto respecto a octubre`, `-3 puntos respecto a octubre`.
 */
export function monthChangePointsText(
  currentPercent: number | null,
  previousPercent: number | null,
  previousMonthIso: string,
): string | null {
  if (currentPercent === null || previousPercent === null) {
    return null;
  }
  const name = MONTH_NAMES[Number(previousMonthIso.slice(5, 7)) - 1] ?? previousMonthIso;
  const delta = currentPercent - previousPercent;
  if (delta === 0) {
    return `Sin cambios respecto a ${name}`;
  }
  const unit = Math.abs(delta) === 1 ? 'punto' : 'puntos';
  return `${delta > 0 ? '+' : '-'}${String(Math.abs(delta))} ${unit} respecto a ${name}`;
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

/** `addDays('2026-01-31', 1)` → `'2026-02-01'`; works across month and year ends. */
export function addDays(date: string, days: number): string {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

/** Days ahead the "Próximos 30 días" block looks. */
export const UPCOMING_DAYS = 30;

/** The window starting at `today` and ending 30 days later, both included. */
export function next30DaysWindow(today: string): { from: string; to: string } {
  return { from: today, to: addDays(today, UPCOMING_DAYS) };
}

/** The months (`YYYY-MM`) touched by the window, oldest first. */
export function windowMonths(window: { from: string; to: string }): string[] {
  const first = window.from.slice(0, 7);
  const last = window.to.slice(0, 7);
  return monthsEnding(last, 3).filter((m) => m >= first);
}

/** True when `date` is inside the window, both ends included. */
export function inWindow(date: string, window: { from: string; to: string }): boolean {
  return date >= window.from && date <= window.to;
}

/** Whole percent of the recorded balance repaid since its date; null without a baseline. */
export function debtProgressPercent(recordedBalanceCents: number, repaidSinceCents: number) {
  if (recordedBalanceCents <= 0) {
    return null;
  }
  const repaid = Math.min(Math.max(repaidSinceCents, 0), recordedBalanceCents);
  return Math.floor((repaid * 100) / recordedBalanceCents);
}
