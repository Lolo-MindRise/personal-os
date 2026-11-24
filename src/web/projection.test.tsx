import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CategoryDto, ProjectionMonthDto } from '../shared/api.js';
import { Navigation } from './App.js';
import { createApiClient } from './api.js';
import {
  ProjectionChart,
  ProjectionExplanation,
  projectionSummary,
  ScenarioForm,
} from './ProjectionPage.js';
import {
  describeScenario,
  emptyScenarioForm,
  goalReachedText,
  monthOutsideRange,
  SCENARIO_ERRORS,
  validateScenarioForm,
} from './projectionForm.js';

const noop = () => undefined;

const categories: CategoryDto[] = [
  { id: 1, name: 'Nómina', kind: 'income' },
  { id: 2, name: 'Ocio', kind: 'expense' },
  { id: 3, name: 'Préstamo', kind: 'repayment' },
];
const range = { currentMonth: '2026-11', endMonth: '2027-06' };

const month = (m: string, accumulatedCents: number): ProjectionMonthDto => ({
  month: m,
  incomeCents: 0,
  expenseCents: 0,
  repaymentCents: 0,
  savingsCents: 0,
  accumulatedCents,
  byCategory: [],
});

describe('validateScenarioForm', () => {
  const form = (over = {}) => ({ ...emptyScenarioForm('2027-01'), ...over });

  it('builds an income scenario with a signed amount in cents', () => {
    expect(validateScenarioForm(form({ amount: '+200,50' }), range, categories)).toEqual({
      ok: true,
      scenario: { type: 'income', fromMonth: '2027-01', amountCents: 20_050 },
    });
    expect(validateScenarioForm(form({ amount: '-50' }), range, categories)).toMatchObject({
      ok: true,
      scenario: { amountCents: -5_000 },
    });
  });

  it('builds a category scenario, where the new amount may be zero', () => {
    expect(
      validateScenarioForm(
        form({ type: 'category', categoryId: '2', amount: '150' }),
        range,
        categories,
      ),
    ).toEqual({
      ok: true,
      scenario: { type: 'category', fromMonth: '2027-01', categoryId: 2, amountCents: 15_000 },
    });
    expect(
      validateScenarioForm(
        form({ type: 'category', categoryId: '2', amount: '0' }),
        range,
        categories,
      ),
    ).toMatchObject({ ok: true, scenario: { amountCents: 0 } });
  });

  it('rejects a month outside the projected range, or not a month', () => {
    const outside = validateScenarioForm(
      form({ fromMonth: '2026-10', amount: '10' }),
      range,
      categories,
    );
    expect(outside).toEqual({
      ok: false,
      errors: { fromMonth: monthOutsideRange('2026-11', '2027-06') },
    });
    expect(
      validateScenarioForm(form({ fromMonth: '2027-07', amount: '10' }), range, categories).ok,
    ).toBe(false);
    expect(validateScenarioForm(form({ fromMonth: '', amount: '10' }), range, categories)).toEqual({
      ok: false,
      errors: { fromMonth: SCENARIO_ERRORS.month },
    });
    // Both ends of the range are valid.
    expect(
      validateScenarioForm(form({ fromMonth: '2026-11', amount: '10' }), range, categories).ok,
    ).toBe(true);
    expect(
      validateScenarioForm(form({ fromMonth: '2027-06', amount: '10' }), range, categories).ok,
    ).toBe(true);
  });

  it('rejects a zero or invalid income amount, with the field message', () => {
    const zero = validateScenarioForm(form({ amount: '0' }), range, categories);
    expect(zero).toEqual({ ok: false, errors: { amount: 'Importe cero.' } });
    const bad = validateScenarioForm(form({ amount: 'mucho' }), range, categories);
    expect(bad).toEqual({ ok: false, errors: { amount: 'Importe no válido.' } });
  });

  it('needs an expense category and a valid amount', () => {
    const none = validateScenarioForm(form({ type: 'category', amount: '10' }), range, categories);
    expect(none).toEqual({ ok: false, errors: { categoryId: SCENARIO_ERRORS.category } });
    // Income and repayment categories are not offered for this kind of adjustment.
    expect(
      validateScenarioForm(
        form({ type: 'category', categoryId: '1', amount: '10' }),
        range,
        categories,
      ).ok,
    ).toBe(false);
    expect(
      validateScenarioForm(
        form({ type: 'category', categoryId: '3', amount: '10' }),
        range,
        categories,
      ).ok,
    ).toBe(false);
    const all = validateScenarioForm(
      form({ type: 'category', categoryId: '', amount: '-3', fromMonth: '2030-01' }),
      range,
      categories,
    );
    expect(all.ok).toBe(false);
    if (!all.ok) {
      expect(Object.keys(all.errors).sort()).toEqual(['amount', 'categoryId', 'fromMonth']);
    }
  });
});

describe('describeScenario and goalReachedText', () => {
  it('describes each kind of adjustment in Spanish', () => {
    const text = (s: Parameters<typeof describeScenario>[0]) =>
      describeScenario(s, categories).replace(' ', ' ');
    expect(text({ type: 'income', fromMonth: '2027-01', amountCents: 20_000 })).toBe(
      'Desde 01/2027: ingresos +200,00 € al mes',
    );
    expect(text({ type: 'income', fromMonth: '2027-01', amountCents: -5_000 })).toBe(
      'Desde 01/2027: ingresos -50,00 € al mes',
    );
    expect(
      text({ type: 'category', fromMonth: '2026-12', categoryId: 2, amountCents: 15_000 }),
    ).toBe('Desde 12/2026: «Ocio» pasa a 150,00 € al mes');
  });

  it('says when a goal is reached, whether that is late, or that it is not within the range', () => {
    const months = [month('2026-11', 100), month('2026-12', 200), month('2027-01', 300)];
    expect(goalReachedText(months, 200, '2027-01')).toBe('se alcanza en 12/2026');
    expect(goalReachedText(months, 300, '2026-12')).toBe(
      'se alcanza en 01/2027 (después de la fecha objetivo)',
    );
    expect(goalReachedText(months, 999, '2027-01')).toMatch(/no se alcanza hasta 01\/2027/);
    expect(goalReachedText([], 1, '2027-01')).toBe('sin datos');
  });
});

describe('projection screen parts', () => {
  const months = [month('2026-11', 100_000), month('2026-12', 220_000)];

  it('summarises the projection, with and without a scenario', () => {
    expect(projectionSummary(0, [], undefined)).toBe('Sin datos.');
    const base = projectionSummary(50_000, months, undefined).replaceAll(' ', ' ');
    expect(base).toBe(
      'De noviembre de 2026 a diciembre de 2026: el ahorro acumulado pasa de 500,00 € a 2.200,00 € sin cambios.',
    );
    const scenario = projectionSummary(50_000, months, [
      month('2026-11', 1),
      month('2026-12', 300_000),
    ]).replaceAll(' ', ' ');
    expect(scenario).toContain('y a 3.000,00 € con el escenario.');
  });

  it('draws the chart inside a figure with a text alternative', () => {
    const html = renderToStaticMarkup(
      <ProjectionChart baselineCents={0} months={months} scenarioMonths={undefined} goals={[]} />,
    );
    expect(html).toContain('data-testid="chart-projection"');
    expect(html).toContain('role="img"');
    expect(html).toContain('Gráfico de la proyección.');
    expect(html).toContain('<figcaption>');
  });

  // The goal lines are SVG, which static rendering does not draw: the e2e test checks that a
  // target far above the projection still shows (`ifOverflow="extendDomain"`).

  it('the scenario form offers expense categories only, and income needs no category', () => {
    const render = (type: 'income' | 'category') =>
      renderToStaticMarkup(
        <ScenarioForm
          values={{ ...emptyScenarioForm('2027-01'), type }}
          categories={categories}
          errors={{}}
          onChange={noop}
          onSubmit={noop}
        />,
      );
    const income = render('income');
    expect(income).toContain('Ingresos al mes: más o menos (€)');
    expect(income).not.toContain('Categoría de gasto');
    expect(income).toContain('Los escenarios no se guardan');
    const category = render('category');
    expect(category).toContain('Categoría de gasto');
    expect(category).toContain('Ocio');
    expect(category).not.toContain('Préstamo');
    expect(category).not.toContain('>Nómina<');
    expect(category).toContain('Nuevo gasto al mes (€)');
  });

  it('the scenario form shows its errors linked to the fields', () => {
    const html = renderToStaticMarkup(
      <ScenarioForm
        values={emptyScenarioForm('2027-01')}
        categories={categories}
        errors={{ amount: 'Importe cero.', fromMonth: 'Elige un mes.' }}
        onChange={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('Importe cero.');
    expect(html).toContain('aria-describedby="scenario-amount-error"');
    expect(html).toContain('aria-describedby="scenario-fromMonth-error"');
  });

  it('explains what is included and what is not', () => {
    const html = renderToStaticMarkup(<ProjectionExplanation />);
    expect(html).toContain('Incluye');
    expect(html).toContain('No incluye');
    expect(html).toContain('presupuesto');
    expect(html).toContain('Mes actual');
  });

  it('has the Proyección section in the navigation', () => {
    expect(renderToStaticMarkup(<Navigation view="dashboard" onChange={noop} />)).toContain(
      'Proyección',
    );
  });
});

describe('api client: projection', () => {
  it('asks for the end month and today', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 200 })));
    await createApiClient(fetchFn).projection('2027-06', '2026-11-15');
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/projection?to=2027-06&today=2026-11-15');
  });
});
