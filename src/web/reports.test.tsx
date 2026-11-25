import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ExpenseReportDto } from '../shared/reports.js';
import { buildExpenseReport } from '../shared/reports.js';
import { Navigation } from './App.js';
import {
  changeText,
  movementsHref,
  movementsPeriodHref,
  PeriodPicker,
  ReportsView,
  seriesKey,
  stackedData,
  trendData,
} from './ReportsPage.js';

const noop = () => undefined;

const data: ExpenseReportDto = {
  month: '2026-03',
  months: 3,
  categories: [
    { id: 1, name: 'Vivienda' },
    { id: 2, name: 'Supermercado' },
  ],
  totals: [
    { month: '2025-12', categoryId: 2, cents: 10_000 },
    { month: '2026-01', categoryId: 2, cents: 17_670 },
    { month: '2026-01', categoryId: 1, cents: 70_000 },
  ],
};

describe('Informes', () => {
  it('is in the sidebar under Seguimiento', () => {
    const html = renderToStaticMarkup(<Navigation view="reports" />);
    expect(html).toContain('Informes');
    expect(html).toContain('href="#/reports"');
  });

  it('links every row to the movements of that category and month', () => {
    const html = renderToStaticMarkup(
      <ReportsView data={data} categoryId={undefined} onCategory={noop} />,
    );
    const escaped = (month: string, id: number) => movementsHref(month, id).replace('&', '&amp;');
    expect(html).toContain(`href="${escaped('2026-01', 1)}"`);
    // Averages and changes cover the whole period (2026-01 to 2026-03).
    expect(html).toContain('href="#/movements?cat=2&amp;from=2026-01-01&amp;to=2026-03-31"');
    expect(html).not.toContain(`href="${escaped('2026-03', 2)}"`);
    expect(html).toContain('href="#/movements?month=2026-01&amp;category=1"');
    expect(html).toContain('Media mensual');
    expect(html).toContain('Cambios respecto al periodo anterior');
  });

  it('links the whole period of the report, to the last day of the last month', () => {
    expect(movementsPeriodHref('2025-03', '2026-02', 7)).toBe(
      '#/movements?cat=7&from=2025-03-01&to=2026-02-28',
    );
    expect(movementsPeriodHref('2023-11', '2024-02', 7)).toContain('to=2024-02-29');
  });

  it('keys chart data by id so names with "." or "[" still draw', () => {
    const odd: ExpenseReportDto = {
      ...data,
      categories: [{ id: 5, name: 'Ropa y calz. [niños]' }],
      totals: [{ month: '2026-01', categoryId: 5, cents: 1_234 }],
    };
    const report = buildExpenseReport(odd);
    const series = report.series[0];
    expect(series?.name).toBe('Ropa y calz. [niños]');
    const key = seriesKey(5);
    expect(key).toBe('c5');
    const stacked = stackedData(report);
    expect(stacked.map((row) => row[key])).toEqual([1_234, 0, 0]);
    expect(series && trendData(report, series).map((row) => row[key])).toEqual([1_234, 0, 0]);
  });

  it('says so when there are no expenses', () => {
    const html = renderToStaticMarkup(
      <ReportsView data={{ ...data, totals: [] }} categoryId={undefined} onCategory={noop} />,
    );
    expect(html).toContain('No hay gastos en este periodo');
    expect(html).not.toContain('chart-stacked');
  });

  it('uses neutral wording for changes', () => {
    const report = buildExpenseReport(data);
    const texts = report.changes.map(changeText);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/^700,00\s€ más que en el periodo anterior$/);
    expect(texts[1]).toMatch(/^76,70\s€ más que en el periodo anterior$/);
    expect(texts.join(' ')).not.toMatch(/ahorr|bien|mal|excesiv/i);
  });

  it('marks the chosen period', () => {
    const html = renderToStaticMarkup(<PeriodPicker value={6} onChange={noop} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>6 meses/);
    expect(html).toMatch(/aria-pressed="false"[^>]*>3 meses/);
  });
});
