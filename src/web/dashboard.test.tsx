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

const noop = () => undefined;

const empty: DashboardDto = {
  month: '2026-03',
  today: '2026-03-15',
  setup: { initialBalance: false, movements: false, goals: false, budget: false, debts: false },
  keyFigures: {
    accumulatedSavingsCents: 0,
    nextGoal: null,
    totalDebtCents: 0,
    projectedSavingsCents: 0,
  },
  months: [],
  categories: [],
  debts: { items: [], totalEstimatedCents: 0 },
  upcoming: { pending: [], milestones: [] },
};

describe('Inicio with no data', () => {
  const html = renderToStaticMarkup(<DashboardView data={empty} onNavigate={noop} />);

  it('says what to set up in every block, with a link to its screen', () => {
    for (const text of [
      'Indicar saldo inicial',
      'Crear un objetivo',
      'Añadir una deuda',
      'Registrar un movimiento',
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

describe('Navigation', () => {
  it('has Inicio first', () => {
    const html = renderToStaticMarkup(<Navigation view="dashboard" onChange={noop} />);
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
