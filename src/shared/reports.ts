import { monthsEnding } from './dashboard.js';

// Pure helpers of Informes (plan 0002, task 02). The server sums expense movements per
// category and month (the same definition as the budget and the movements screen); everything
// else (period, averages, comparison) is arranged here, in integer cents.

/** Period lengths the user can pick, in months. */
export const REPORT_PERIODS = [3, 6, 12] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const DEFAULT_REPORT_PERIOD: ReportPeriod = 6;
/** How many categories the "changed most" list shows at most. */
export const MAX_CHANGES = 5;

export const isReportPeriod = (value: number): value is ReportPeriod =>
  (REPORT_PERIODS as readonly number[]).includes(value);

export interface ReportCategoryDto {
  id: number;
  name: string;
}

export interface ReportTotalDto {
  month: string;
  categoryId: number;
  /** Sum of the expense movements of that category in that month. */
  cents: number;
}

/** Expense totals for the `months` months ending at `month` plus the `months` before them. */
export interface ExpenseReportDto {
  month: string;
  months: number;
  categories: ReportCategoryDto[];
  totals: ReportTotalDto[];
}

/** First and last month of the previous period of the same length. */
export function reportWindows(
  month: string,
  count: number,
): { months: string[]; previousMonths: string[] } {
  const all = monthsEnding(month, count * 2);
  return { months: all.slice(count), previousMonths: all.slice(0, count) };
}

export interface CategorySeries {
  categoryId: number;
  name: string;
  /** One value per month of the period, oldest first; 0 for months without spending. */
  monthlyCents: number[];
  totalCents: number;
  /** Total divided by the number of months of the period, rounded to the cent. */
  averageCents: number;
}

export interface CategoryChange {
  categoryId: number;
  name: string;
  currentCents: number;
  previousCents: number;
  /** current − previous; never 0 in the list. */
  deltaCents: number;
  direction: 'up' | 'down';
}

export interface ExpenseReport {
  months: string[];
  previousMonths: string[];
  /** Categories with spending in the period, biggest total first. */
  series: CategorySeries[];
  monthTotalsCents: number[];
  totalCents: number;
  /** At most five; empty when the previous period has no spending to compare with. */
  changes: CategoryChange[];
}

export function buildExpenseReport(dto: ExpenseReportDto): ExpenseReport {
  const { months, previousMonths } = reportWindows(dto.month, dto.months);
  const cell = new Map<string, number>();
  for (const t of dto.totals) {
    const key = `${String(t.categoryId)}|${t.month}`;
    cell.set(key, (cell.get(key) ?? 0) + t.cents);
  }
  const at = (categoryId: number, month: string) => cell.get(`${String(categoryId)}|${month}`) ?? 0;
  const sumOver = (categoryId: number, list: string[]) =>
    list.reduce((total, month) => total + at(categoryId, month), 0);

  const series: CategorySeries[] = dto.categories
    .map((c) => {
      const monthlyCents = months.map((m) => at(c.id, m));
      const totalCents = monthlyCents.reduce((a, b) => a + b, 0);
      return {
        categoryId: c.id,
        name: c.name,
        monthlyCents,
        totalCents,
        averageCents: Math.round(totalCents / months.length),
      };
    })
    .filter((s) => s.totalCents > 0)
    .sort((a, b) => b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'es'));

  const previousTotal = dto.categories.reduce((t, c) => t + sumOver(c.id, previousMonths), 0);
  const changes: CategoryChange[] =
    previousTotal === 0
      ? []
      : dto.categories
          .map((c) => {
            const currentCents = sumOver(c.id, months);
            const previousCents = sumOver(c.id, previousMonths);
            const deltaCents = currentCents - previousCents;
            return {
              categoryId: c.id,
              name: c.name,
              currentCents,
              previousCents,
              deltaCents,
              direction: deltaCents > 0 ? ('up' as const) : ('down' as const),
            };
          })
          .filter((c) => c.deltaCents !== 0)
          .sort(
            (a, b) =>
              Math.abs(b.deltaCents) - Math.abs(a.deltaCents) || a.name.localeCompare(b.name, 'es'),
          )
          .slice(0, MAX_CHANGES);

  return {
    months,
    previousMonths,
    series,
    monthTotalsCents: months.map((_, i) =>
      series.reduce((t, s) => t + (s.monthlyCents[i] ?? 0), 0),
    ),
    totalCents: series.reduce((t, s) => t + s.totalCents, 0),
    changes,
  };
}
