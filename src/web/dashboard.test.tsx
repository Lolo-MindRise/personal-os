import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DashboardDebtDto, DashboardDto } from '../shared/api.js';
import { Navigation } from './App.js';
import {
  categoriesSummaryText,
  categoryLabel,
  monthsSummaryText,
  shortMonth,
} from './DashboardCharts.js';
import { DashboardView, DebtCard } from './DashboardPage.js';

const empty: DashboardDto = {
  month: '2026-03',
  today: '2026-03-15',
  setup: { initialBalance: false, movements: false, goals: false, budget: false, debts: false },
  keyFigures: {
    accumulatedSavingsCents: 0,
    nextGoal: null,
    totalDebtCents: 0,
    projectedSavingsCents: 0,
    previous: {
      month: '2026-02',
      accumulatedSavingsCents: null,
      projectedSavingsCents: null,
      totalDebtCents: null,
      goalProgressPercent: null,
    },
  },
  months: [],
  categories: [],
  budgetAlerts: [],
  debts: { items: [], totalEstimatedCents: 0 },
  upcoming: { pending: [], milestones: [] },
  accounts: [{ accountId: 1, name: 'Principal', balanceCents: 0 }],
  next30Days: { from: '2026-03-15', to: '2026-04-14', fixed: [], milestones: [] },
};

describe('Inicio accounts and next 30 days', () => {
  it('shows a single account and the empty next-30-days message', () => {
    const html = renderToStaticMarkup(<DashboardView data={empty} />);
    expect(html).toContain('data-testid="dashboard-accounts"');
    expect(html).toContain('Principal');
    expect(html).toContain('href="#/accounts"');
    expect(html).toContain('No hay fijos pendientes ni hitos en los próximos 30 días.');
  });

  it('lists accounts with balances and the items due, linking to their screens', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        data={{
          ...empty,
          accounts: [
            { accountId: 1, name: 'Principal', balanceCents: 12_345 },
            { accountId: 2, name: 'Efectivo', balanceCents: -500 },
          ],
          next30Days: {
            from: '2026-03-15',
            to: '2026-04-14',
            fixed: [
              {
                recurringItemId: 7,
                month: '2026-03',
                date: '2026-03-20',
                kind: 'expense',
                categoryId: 1,
                categoryName: 'Hogar',
                concept: 'Internet',
                amountCents: 3_500,
                notes: null,
                heldByTrash: false,
              },
            ],
            milestones: [
              {
                id: 3,
                title: 'Revisar seguros',
                targetDate: '2026-04-01',
                status: 'pending',
                notes: null,
              },
            ],
          },
        }}
      />,
    );
    expect(html).toMatch(/Principal<\/a> <span[^>]*>123,45/);
    expect(html).toContain('Efectivo');
    expect(html).toContain('Internet');
    expect(html).toContain('href="#/recurring"');
    expect(html).toContain('Revisar seguros');
    expect(html).toContain('href="#/milestones"');
    expect(html).not.toContain('No hay fijos pendientes ni hitos');
  });
});

describe('Inicio budget alerts', () => {
  const withBudget = { ...empty, setup: { ...empty.setup, budget: true } };

  it('is hidden without a budget and says so kindly when nothing is at 80 %', () => {
    expect(renderToStaticMarkup(<DashboardView data={empty} />)).not.toContain('budget-alerts');
    const html = renderToStaticMarkup(<DashboardView data={withBudget} />);
    expect(html).toContain('Ninguna categoría ha llegado al 80 % de su presupuesto');
  });

  it('lists categories by state, with neutral wording and a filtered link', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        data={{
          ...withBudget,
          budgetAlerts: [
            {
              categoryId: 7,
              categoryName: 'Vivienda',
              budgetCents: 70_000,
              actualCents: 75_000,
              percent: 107,
              state: 'over',
            },
            {
              categoryId: 3,
              categoryName: 'Supermercado',
              budgetCents: 35_000,
              actualCents: 29_750,
              percent: 85,
              state: 'warning',
            },
          ],
        }}
      />,
    );
    expect(html).toContain('data-testid="budget-alerts-over"');
    expect(html).toContain('data-testid="budget-alerts-warning"');
    expect(html).toContain('Presupuesto alcanzado o superado');
    expect(html).toContain('Cerca del presupuesto');
    expect(html).toMatch(/Supermercado<\/a>: 85 % del presupuesto/);
    expect(html).toMatch(/Vivienda<\/a>: 107 % del presupuesto/);
    expect(html).toContain('href="#/movements?category=3&amp;month=2026-03"');
  });
});

describe('Inicio with no data', () => {
  const html = renderToStaticMarkup(<DashboardView data={empty} />);

  it('says what to set up in every block, with a link to its screen', () => {
    for (const text of [
      'Indicar saldo inicial',
      'Añadir un objetivo',
      'Añadir una deuda',
      'Añadir un movimiento',
      'Definir un presupuesto',
      'Añadir un hito',
      'Ver fijos',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('Aún no hay movimientos, así que no hay nada que dibujar.');
  });

  it('draws no chart without data', () => {
    expect(html).not.toContain('data-testid="chart-months"');
    expect(html).not.toContain('data-testid="chart-categories"');
  });
});

describe('Inicio month-over-month', () => {
  const withPrevious = (
    previous: DashboardDto['keyFigures']['previous'],
    over: Partial<DashboardDto['keyFigures']> = {},
  ): DashboardDto => ({
    ...empty,
    month: '2026-01',
    keyFigures: {
      ...empty.keyFigures,
      accumulatedSavingsCents: 10_000,
      projectedSavingsCents: 4_000,
      ...over,
      previous,
    },
  });

  it('shows the change against the previous month in neutral words', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        data={withPrevious(
          {
            month: '2025-12',
            accumulatedSavingsCents: -2_000,
            projectedSavingsCents: 4_000,
            totalDebtCents: 31_000,
            goalProgressPercent: 20,
          },
          {
            totalDebtCents: 30_000,
            nextGoal: {
              id: 1,
              name: 'Fondo',
              targetAmountCents: 100_000,
              targetDate: '2026-12-31',
              accumulatedCents: 25_000,
              progressPercent: 25,
              remainingCents: 75_000,
              status: 'open',
              monthsLeft: 12,
              monthlyRequiredCents: 6_250,
            },
          },
        )}
      />,
    );
    expect(html).toMatch(/\+120,00\s€ respecto a diciembre/);
    expect(html).toContain('Sin cambios respecto a diciembre');
    expect(html).toMatch(/-10,00\s€ respecto a diciembre/);
    expect(html).toContain('+5 puntos respecto a diciembre');
  });

  it('shows nothing when the previous month has no data', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        data={withPrevious({
          month: '2025-12',
          accumulatedSavingsCents: null,
          projectedSavingsCents: null,
          totalDebtCents: null,
          goalProgressPercent: null,
        })}
      />,
    );
    expect(html).not.toContain('respecto a');
  });
});

describe('Navigation', () => {
  it('has Inicio first', () => {
    const html = renderToStaticMarkup(<Navigation view="dashboard" />);
    expect(html.indexOf('Inicio')).toBeLessThan(html.indexOf('Movimientos'));
    expect(html).toContain('aria-current="page"');
  });
});

const debt = (over: Partial<DashboardDebtDto> = {}): DashboardDebtDto => ({
  id: 1,
  name: 'Préstamo',
  estimatedBalanceCents: 225_000,
  remainingInstallments: 18,
  monthlyPaymentCents: 15_000,
  recordedBalanceCents: 300_000,
  balanceAsOf: '2026-01-31',
  repaidSinceCents: 75_000,
  interestPaidCents: 0,
  progressPercent: 25,
  ...over,
});

describe('DebtCard', () => {
  it('shows balance, installments and a progress bar with its baseline', () => {
    const html = renderToStaticMarkup(<DebtCard debt={debt()} />);
    expect(html).toContain('2.250,00');
    expect(html).toContain('18 cuotas restantes');
    expect(html).toContain('aria-valuenow="25"');
    expect(html).toContain('31/01/2026');
  });

  it('shows the interest paid in installments and no longer says installments are not deducted', () => {
    const html = renderToStaticMarkup(<DebtCard debt={debt({ interestPaidCents: 5_000 })} />);
    expect(html).toMatch(/Intereses pagados en cuotas: 50,00\s€/);
    expect(html).not.toContain('no se descuentan');
  });

  it('draws no progress bar without a real baseline', () => {
    const html = renderToStaticMarkup(
      <DebtCard debt={debt({ progressPercent: null, recordedBalanceCents: 0 })} />,
    );
    expect(html).not.toContain('progressbar');
  });
});

describe('chart texts', () => {
  it('short month labels', () => {
    expect(shortMonth('2026-01')).toBe('ene 26');
    expect(shortMonth('2025-12')).toBe('dic 25');
  });

  it('over-budget categories are named in words', () => {
    const over = {
      categoryId: 1,
      categoryName: 'Ocio',
      budgetCents: 10_000,
      actualCents: 20_000,
      overBudget: true,
    };
    const fine = { ...over, categoryId: 2, categoryName: 'Vivienda', overBudget: false };
    expect(categoryLabel(over)).toBe('Ocio (excedido)');
    expect(categoryLabel(fine)).toBe('Vivienda');
    expect(categoriesSummaryText([over, fine])).toContain('Superan su presupuesto: Ocio.');
    expect(categoriesSummaryText([fine])).toContain('Ninguna categoría supera su presupuesto.');
  });

  it('the months summary gives the range and totals', () => {
    const text = monthsSummaryText([
      {
        month: '2025-12',
        incomeCents: 100,
        expenseCents: 50,
        repaymentCents: 0,
        savingsCents: 50,
        accumulatedCents: null,
      },
      {
        month: '2026-01',
        incomeCents: 200,
        expenseCents: 50,
        repaymentCents: 0,
        savingsCents: 150,
        accumulatedCents: 1_000,
      },
    ]);
    expect(text).toContain('De diciembre de 2025 a enero de 2026');
    expect(text).toContain('ingresos 3,00');
    expect(text).toContain('ahorro acumulado 10,00');
  });
});
