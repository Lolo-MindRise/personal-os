import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { BudgetMonthDto, CategoryDto } from '../shared/api.js';
import { createApiClient } from './api.js';
import {
  differenceTone,
  emptyBudgetForm,
  mapBudgetApiErrors,
  validateBudgetForm,
} from './budgetForm.js';
import { BudgetForm, BudgetTable } from './BudgetPage.js';
import { Navigation } from './App.js';

const noop = () => undefined;

const data: BudgetMonthDto = {
  month: '2026-01',
  rows: [
    {
      categoryId: 1,
      categoryName: 'Vivienda',
      kind: 'expense',
      budgetCents: 70_000,
      budgetFrom: '2026-01',
      actualCents: 75_000,
      differenceCents: -5_000,
    },
    {
      categoryId: 2,
      categoryName: 'Ocio',
      kind: 'expense',
      budgetCents: 10_000,
      budgetFrom: '2025-11',
      actualCents: 2_400,
      differenceCents: 7_600,
    },
    {
      categoryId: 3,
      categoryName: 'Suministros',
      kind: 'expense',
      budgetCents: null,
      budgetFrom: null,
      actualCents: 0,
      differenceCents: null,
    },
  ],
  totals: { budgetCents: 80_000, actualCents: 77_400, differenceCents: 2_600 },
};

describe('BudgetTable', () => {
  const html = renderToStaticMarkup(<BudgetTable data={data} onChange={noop} />);

  it('shows budget, actual and difference per category in Spanish format', () => {
    expect(html).toMatch(/700,00\s€/);
    expect(html).toMatch(/750,00\s€/);
    expect(html).toMatch(/-50,00\s€/);
    expect(html).toMatch(/76,00\s€/);
  });

  it('says since when the budget applies, and when there is none', () => {
    expect(html).toContain('desde 01/2026');
    expect(html).toContain('desde 11/2025');
    expect(html).toContain('Sin presupuesto');
    expect(html).toContain('—');
  });

  it('marks over-budget rows and offers Fijar or Cambiar', () => {
    expect(html).toContain('diff-over');
    expect(html).toContain('diff-under');
    expect(html).toContain('Fijar');
    expect(html.match(/Cambiar/g)).toHaveLength(2);
  });

  it('ends with a totals row', () => {
    expect(html).toContain('<tfoot>');
    expect(html).toMatch(
      /Total<\/th><td class="amount">800,00\s€<\/td><td class="amount">774,00\s€/,
    );
    expect(html).toMatch(/26,00\s€/);
  });

  it('explains an empty list', () => {
    const empty = renderToStaticMarkup(
      <BudgetTable
        data={{ ...data, rows: [], totals: { budgetCents: 0, actualCents: 0, differenceCents: 0 } }}
        onChange={noop}
      />,
    );
    expect(empty).toContain('No hay categorías de gasto');
  });
});

describe('BudgetForm', () => {
  const categories: CategoryDto[] = [{ id: 1, name: 'Vivienda', kind: 'expense' }];
  const render = (errors = {}, formError?: string) =>
    renderToStaticMarkup(
      <BudgetForm
        values={emptyBudgetForm('2026-03')}
        categories={categories}
        errors={errors}
        formError={formError}
        busy={false}
        onChange={noop}
        onSubmit={noop}
      />,
    );

  it('defaults "Desde" to the selected month and explains that history is kept', () => {
    const html = render();
    expect(html).toContain('value="2026-03"');
    expect(html).toContain('Los meses anteriores no cambian');
  });

  it('shows field errors and the form error', () => {
    const html = render({ amount: 'Introduce un importe.' }, 'Ya hay un presupuesto');
    expect(html).toContain('Introduce un importe.');
    expect(html).toContain('aria-describedby="budget-amount-error"');
    expect(html).toContain('Ya hay un presupuesto');
  });
});

describe('validateBudgetForm', () => {
  it('builds the payload in cents', () => {
    expect(
      validateBudgetForm({ categoryId: '4', amount: '1.234,50', validFrom: '2026-03' }),
    ).toEqual({ ok: true, payload: { categoryId: 4, amountCents: 123_450, validFrom: '2026-03' } });
  });

  it('reports every invalid field in Spanish', () => {
    const result = validateBudgetForm({ categoryId: '', amount: '0', validFrom: '' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(['amount', 'categoryId', 'validFrom']);
      expect(result.errors.categoryId).toBe('Elige una categoría.');
    }
  });

  it('maps API field names to form fields and drops unknown ones', () => {
    expect(mapBudgetApiErrors({ amountCents: 'x', other: 'y', validFrom: 'z' })).toEqual({
      amount: 'x',
      validFrom: 'z',
    });
  });
});

describe('differenceTone', () => {
  it('is over below zero, under at or above zero, none without a budget', () => {
    expect(differenceTone(-1)).toBe('over');
    expect(differenceTone(0)).toBe('under');
    expect(differenceTone(5)).toBe('under');
    expect(differenceTone(null)).toBe('none');
  });
});

describe('navigation and api client', () => {
  it('has a Presupuesto section', () => {
    expect(renderToStaticMarkup(<Navigation view="budget" onChange={noop} />)).toContain(
      'Presupuesto',
    );
  });

  it('reads the month budget and posts a line', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify(data), { status: 200 })),
    );
    const api = createApiClient(fetchFn);
    await api.budget('2026-01');
    const payload = { categoryId: 1, amountCents: 100, validFrom: '2026-02' };
    await api.addBudgetLine(payload);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/months/2026-01/budget');
    expect(fetchFn.mock.calls[1]).toEqual([
      '/api/budget-lines',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(payload) }),
    ]);
  });
});
