import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ExpenseReportDto } from '../shared/reports.js';
import { buildExpenseReport } from '../shared/reports.js';
import { Navigation } from './App.js';
import { changeText, movementsHref, PeriodPicker, ReportsView } from './ReportsPage.js';

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
    expect(html).toContain(`href="${escaped('2026-03', 2)}"`); // averages and changes: last month
    expect(html).toContain('href="#/movements?month=2026-01&amp;category=1"');
    expect(html).toContain('Media mensual');
    expect(html).toContain('Cambios respecto al periodo anterior');
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
