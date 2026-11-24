import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CategoryDto, MonthSummaryDto, MovementDto } from '../shared/api.js';
import { MovementForm } from './MovementForm.js';
import { MovementList } from './MovementList.js';
import { emptyForm } from './movementForm.js';
import { SummaryBar } from './SummaryBar.js';

const noop = () => undefined;

const movements: MovementDto[] = [
  {
    id: 2,
    date: '2026-01-20',
    kind: 'expense',
    categoryId: 4,
    categoryName: 'Ocio',
    concept: 'Cine',
    amountCents: 2_400,
    notes: 'Entradas para dos',
    debtId: null,
    recurringItemId: null,
  },
  {
    id: 1,
    date: '2026-01-01',
    kind: 'income',
    categoryId: 1,
    categoryName: 'Nómina ficticia',
    concept: 'Nómina',
    amountCents: 200_000,
    notes: null,
    debtId: null,
    recurringItemId: null,
  },
];

describe('MovementList', () => {
  const html = renderToStaticMarkup(
    <MovementList movements={movements} onEdit={noop} onDelete={noop} />,
  );

  it('shows what the API returned: date, kind, category, concept and amount', () => {
    expect(html).toContain('20/01/2026');
    expect(html).toContain('Gasto');
    expect(html).toContain('Ocio');
    expect(html).toContain('Cine');
    expect(html).toContain('24,00\u00A0€');
    expect(html).toContain('Ingreso');
    expect(html).toContain('2.000,00\u00A0€');
    expect(html).toContain('Entradas para dos');
  });

  it('keeps the order it was given (newest first from the API)', () => {
    expect(html.indexOf('Cine')).toBeLessThan(html.indexOf('Nómina</td>'));
  });

  it('has an edit and a delete button per row', () => {
    expect(html.match(/>Editar</g)).toHaveLength(2);
    expect(html.match(/>Eliminar</g)).toHaveLength(2);
  });

  it('shows a message when the month has no movements', () => {
    const empty = renderToStaticMarkup(
      <MovementList movements={[]} onEdit={noop} onDelete={noop} />,
    );
    expect(empty).toContain('No hay movimientos este mes.');
    expect(empty).not.toContain('<table');
  });
});

describe('SummaryBar', () => {
  const summary: MonthSummaryDto = {
    month: '2026-01',
    incomeCents: 200_000,
    expenseCents: 90_070,
    repaymentCents: 10_000,
    savingsCents: 99_930,
    pendingIncomeCents: 0,
    pendingExpenseCents: 13_000,
    pendingRepaymentCents: 0,
    projectedSavingsCents: 86_930,
  };

  it('shows the four totals in Spanish', () => {
    const html = renderToStaticMarkup(<SummaryBar summary={summary} />);
    for (const text of ['Ingresos', 'Gastos', 'Amortizaciones', 'Ahorro']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('999,30\u00A0€');
    expect(html).not.toContain('negative');
  });

  it('shows the pending amounts and the projected savings below the totals', () => {
    const html = renderToStaticMarkup(<SummaryBar summary={summary} />);
    for (const text of [
      'Ingresos pendientes',
      'Gastos pendientes',
      'Amortizaciones pendientes',
      'Ahorro previsto',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/130,00\s€/); // pending expenses
    expect(html).toMatch(/869,30\s€/); // projected savings
    expect(html.indexOf('Ahorro</dt>')).toBeLessThan(html.indexOf('Ingresos pendientes'));
  });

  it('keeps the pending figures out of the confirmed totals', () => {
    const html = renderToStaticMarkup(<SummaryBar summary={summary} />);
    // Only the four confirmed totals use the `summary-item` class.
    expect(html.match(/class="summary-item/g)).toHaveLength(4);
    expect(html.match(/class="pending-item/g)).toHaveLength(4);
  });

  it('flags a negative projection', () => {
    const html = renderToStaticMarkup(
      <SummaryBar summary={{ ...summary, projectedSavingsCents: -100 }} />,
    );
    expect(html).toContain('pending-item negative');
    expect(html).not.toContain('summary-item negative');
  });

  it('flags a negative saving', () => {
    const html = renderToStaticMarkup(<SummaryBar summary={{ ...summary, savingsCents: -500 }} />);
    expect(html).toContain('-5,00\u00A0€');
    expect(html).toContain('negative');
  });
});

describe('MovementForm', () => {
  const categories: CategoryDto[] = [
    { id: 1, name: 'Nómina ficticia', kind: 'income' },
    { id: 2, name: 'Vivienda', kind: 'expense' },
    { id: 3, name: 'Supermercado', kind: 'expense' },
    { id: 4, name: 'Amortización extra', kind: 'repayment' },
  ];
  const render = (props: Partial<Parameters<typeof MovementForm>[0]> = {}) =>
    renderToStaticMarkup(
      <MovementForm
        values={emptyForm('2026-01-10')}
        categories={categories}
        errors={{}}
        mode="add"
        onChange={noop}
        onSubmit={noop}
        onInvalid={noop}
        onCancel={noop}
        {...props}
      />,
    );

  it('defaults the date to the given day and lists only categories of the selected kind', () => {
    const html = render();
    expect(html).toContain('value="2026-01-10"');
    expect(html).toContain('Vivienda');
    expect(html).toContain('Supermercado');
    expect(html).not.toContain('Nómina ficticia');
    expect(html).not.toContain('Amortización extra');
  });

  it('changes the category list with the kind', () => {
    const html = render({ values: { ...emptyForm('2026-01-10'), kind: 'income' } });
    expect(html).toContain('Nómina ficticia');
    expect(html).not.toContain('Vivienda');
  });

  it('shows each error next to its field, linked for screen readers', () => {
    const html = render({
      errors: { amount: 'Introduce un importe.', concept: 'Escribe un concepto.' },
    });
    expect(html).toContain('id="movement-amount-error"');
    expect(html).toContain('aria-describedby="movement-amount-error"');
    expect(html).toContain('Introduce un importe.');
    expect(html).toContain('Escribe un concepto.');
    expect(html).not.toContain('movement-date-error');
  });

  it('switches its texts when editing', () => {
    expect(render()).toContain('Añadir movimiento');
    const editing = render({ mode: 'edit' });
    expect(editing).toContain('Editar movimiento');
    expect(editing).toContain('Guardar movimiento');
    expect(editing).toContain('Cancelar');
  });

  it('confirming a fixed item locks kind and category, and says "Confirmar"', () => {
    const confirming = render({
      mode: 'confirm',
      values: { ...emptyForm('2026-01-10'), categoryId: '2' },
    });
    expect(confirming).toContain('Confirmar fijo');
    expect(confirming).toContain('>Confirmar fijo<');
    expect(confirming).toContain('Cancelar');
    // Kind and category are disabled; date, concept, amount and notes are not.
    expect(confirming.match(/<select[^>]*disabled/g)).toHaveLength(2);
    expect(confirming).not.toMatch(/<input[^>]*disabled/);
    // Adding or editing keeps them enabled.
    expect(render({ mode: 'edit' })).not.toMatch(/<select[^>]*disabled/);
    expect(render()).not.toMatch(/<select[^>]*disabled/);
  });

  it('has no cancel button when adding', () => {
    expect(render()).not.toContain('Cancelar');
  });

  it('shows a general error that is not tied to a field', () => {
    expect(render({ formError: 'No se ha podido conectar con el servidor.' })).toContain(
      'No se ha podido conectar con el servidor.',
    );
  });
});
