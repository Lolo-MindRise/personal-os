import { describe, expect, it } from 'vitest';
import {
  buildExpenseReport,
  isReportPeriod,
  reportWindows,
  type ExpenseReportDto,
} from './reports.js';

const cats = [
  { id: 1, name: 'Vivienda' },
  { id: 2, name: 'Supermercado' },
  { id: 3, name: 'Ocio' },
];

const dto = (over: Partial<ExpenseReportDto> = {}): ExpenseReportDto => ({
  month: '2026-03',
  months: 3,
  categories: cats,
  totals: [],
  ...over,
});

describe('reportWindows', () => {
  it('ends at the month and the previous period has the same length', () => {
    expect(reportWindows('2026-06', 3)).toEqual({
      months: ['2026-04', '2026-05', '2026-06'],
      previousMonths: ['2026-01', '2026-02', '2026-03'],
    });
  });

  it('wraps over the year boundary', () => {
    expect(reportWindows('2026-02', 3)).toEqual({
      months: ['2025-12', '2026-01', '2026-02'],
      previousMonths: ['2025-09', '2025-10', '2025-11'],
    });
    expect(reportWindows('2026-01', 12).months[0]).toBe('2025-02');
    expect(reportWindows('2026-01', 12).previousMonths[0]).toBe('2024-02');
  });

  it('accepts only 3, 6 and 12 months', () => {
    expect([3, 6, 12, 4, 0, 24].map(isReportPeriod)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
    ]);
  });
});

describe('buildExpenseReport', () => {
  it('is empty without data', () => {
    const report = buildExpenseReport(dto());
    expect(report.series).toEqual([]);
    expect(report.changes).toEqual([]);
    expect(report.totalCents).toBe(0);
    expect(report.months).toHaveLength(3);
  });

  it('fills empty months with 0 and orders categories by total', () => {
    const report = buildExpenseReport(
      dto({
        totals: [
          { month: '2026-01', categoryId: 2, cents: 5_000 },
          { month: '2026-03', categoryId: 2, cents: 2_500 },
          { month: '2026-02', categoryId: 1, cents: 70_000 },
        ],
      }),
    );
    expect(report.months).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(report.series.map((s) => s.name)).toEqual(['Vivienda', 'Supermercado']);
    expect(report.series[1]?.monthlyCents).toEqual([5_000, 0, 2_500]);
    expect(report.monthTotalsCents).toEqual([5_000, 70_000, 2_500]);
    expect(report.totalCents).toBe(77_500);
  });

  it('averages over every month of the period, in whole cents', () => {
    const report = buildExpenseReport(
      dto({ totals: [{ month: '2026-02', categoryId: 3, cents: 1_000 }] }),
    );
    // 1000 / 3 = 333,33 → 333
    expect(report.series[0]?.averageCents).toBe(333);
    const two = buildExpenseReport(
      dto({ totals: [{ month: '2026-02', categoryId: 3, cents: 1_001 }] }),
    );
    expect(two.series[0]?.averageCents).toBe(334);
  });

  it('ignores totals outside the period when summing the current one', () => {
    const report = buildExpenseReport(
      dto({
        totals: [
          { month: '2025-12', categoryId: 1, cents: 99_999 },
          { month: '2026-03', categoryId: 1, cents: 100 },
        ],
      }),
    );
    expect(report.series[0]?.totalCents).toBe(100);
  });

  it('compares with the previous period: biggest absolute change first, at most five', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ id: i + 1, name: `C${String(i + 1)}` }));
    const report = buildExpenseReport({
      month: '2026-03',
      months: 3,
      categories: many,
      totals: many.flatMap((c) => [
        { month: '2025-12', categoryId: c.id, cents: 1_000 },
        {
          month: '2026-02',
          categoryId: c.id,
          cents: 1_000 + c.id * 100 * (c.id % 2 === 0 ? -1 : 1),
        },
      ]),
    });
    expect(report.changes).toHaveLength(5);
    const deltas = report.changes.map((c) => Math.abs(c.deltaCents));
    expect(deltas).toEqual([...deltas].sort((a, b) => b - a));
    expect(report.changes[0]).toMatchObject({ name: 'C7', deltaCents: 700, direction: 'up' });
    expect(report.changes[1]).toMatchObject({ name: 'C6', deltaCents: -600, direction: 'down' });
  });

  it('shows a category that stopped or started, and skips unchanged ones', () => {
    const report = buildExpenseReport(
      dto({
        totals: [
          { month: '2025-12', categoryId: 1, cents: 30_000 },
          { month: '2026-01', categoryId: 2, cents: 4_000 },
          { month: '2025-11', categoryId: 3, cents: 500 },
          { month: '2026-01', categoryId: 3, cents: 500 },
        ],
      }),
    );
    expect(report.changes.map((c) => [c.name, c.deltaCents, c.direction])).toEqual([
      ['Vivienda', -30_000, 'down'],
      ['Supermercado', 4_000, 'up'],
    ]);
  });

  it('shows no changes when the previous period has no spending', () => {
    const report = buildExpenseReport(
      dto({ totals: [{ month: '2026-03', categoryId: 1, cents: 5_000 }] }),
    );
    expect(report.series).toHaveLength(1);
    expect(report.changes).toEqual([]);
  });
});
