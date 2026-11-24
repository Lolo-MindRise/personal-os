import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CategoryDto, PendingEntryDto, RecurringItemDto } from '../shared/api.js';
import { Navigation } from './App.js';
import { PendingList } from './PendingList.js';
import { RecurringForm } from './RecurringForm.js';
import { RecurringList } from './RecurringList.js';
import { emptyRecurringForm } from './recurringForm.js';

const noop = () => undefined;

const entry = (over: Partial<PendingEntryDto> = {}): PendingEntryDto => ({
  recurringItemId: 1,
  month: '2026-01',
  date: '2026-01-10',
  kind: 'expense',
  categoryId: 4,
  categoryName: 'Suministros',
  concept: 'Internet',
  amountCents: 3_500,
  notes: null,
  ...over,
});

describe('PendingList', () => {
  const render = (pending: PendingEntryDto[], skipped: PendingEntryDto[] = [], busy = false) =>
    renderToStaticMarkup(
      <PendingList
        pending={pending}
        skipped={skipped}
        busy={busy}
        onConfirm={noop}
        onSkip={noop}
        onUndo={noop}
        onConfirmAll={noop}
      />,
    );

  it('shows each pending entry with expected date, category, concept and amount', () => {
    const html = render([
      entry(),
      entry({
        recurringItemId: 2,
        date: '2026-01-12',
        concept: 'Electricidad',
        amountCents: 6_500,
      }),
    ]);
    expect(html).toContain('Pendientes');
    expect(html).toContain('10/01/2026');
    expect(html).toContain('Suministros');
    expect(html).toContain('Internet');
    expect(html).toMatch(/35,00\s€/);
    expect(html).toContain('Electricidad');
    expect(html).toMatch(/65,00\s€/);
    expect(html.indexOf('Internet')).toBeLessThan(html.indexOf('Electricidad'));
  });

  it('has Confirmar and Saltar per pending entry, and a Confirmar todos button', () => {
    const html = render([entry(), entry({ recurringItemId: 2, concept: 'Gimnasio' })]);
    expect(html.match(/>Confirmar</g)).toHaveLength(2);
    expect(html.match(/>Saltar</g)).toHaveLength(2);
    expect(html).toContain('>Confirmar todos<');
    expect(html).not.toContain('>Deshacer<');
  });

  it('shows skipped entries apart, with Deshacer and no Confirmar', () => {
    const html = render([], [entry({ concept: 'Gimnasio' })]);
    expect(html).toContain('Gimnasio');
    expect(html).toContain('Saltado este mes');
    expect(html).toContain('>Deshacer<');
    expect(html).not.toContain('>Saltar<');
    expect(html).not.toMatch(/>Confirmar</);
    // With nothing pending, "Confirmar todos" is disabled.
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Confirmar todos</);
  });

  it('shows a message when nothing is pending or skipped, and disables Confirmar todos', () => {
    const html = render([]);
    expect(html).toContain('No hay fijos pendientes este mes.');
    expect(html).not.toContain('<table');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Confirmar todos</);
  });

  it('enables Confirmar todos when something is pending, and disables actions while busy', () => {
    expect(render([entry()])).not.toMatch(/<button[^>]*disabled/);
    const busy = render([entry()], [entry({ recurringItemId: 2 })], true);
    expect(busy.match(/<button[^>]*disabled/g)).toHaveLength(4); // all, confirm, skip, undo
  });
});

describe('RecurringList', () => {
  const items: RecurringItemDto[] = [
    {
      id: 1,
      kind: 'income',
      categoryId: 1,
      categoryName: 'Nómina ficticia',
      concept: 'Nómina',
      amountCents: 200_000,
      expectedDay: 1,
      startMonth: '2026-01',
      endMonth: null,
      notes: null,
      debtId: null,
    },
    {
      id: 2,
      kind: 'expense',
      categoryId: 2,
      categoryName: 'Ocio',
      concept: 'Curso',
      amountCents: 4_500,
      expectedDay: 15,
      startMonth: '2026-02',
      endMonth: '2026-05',
      notes: 'Solo hasta mayo',
      debtId: null,
    },
  ];
  const render = (rows: RecurringItemDto[], month = '2026-08') =>
    renderToStaticMarkup(<RecurringList items={rows} month={month} onEdit={noop} onEnd={noop} />);

  it('shows type, category, concept, day, expected amount and the months', () => {
    const html = render(items);
    expect(html).toContain('Ingreso');
    expect(html).toContain('Nómina ficticia');
    expect(html).toMatch(/2\.000,00\s€/);
    expect(html).toContain('01/2026');
    expect(html).toContain('Sin fin');
    expect(html).toContain('Solo hasta mayo');
    expect(html).toContain('02/2026');
    expect(html).toContain('05/2026');
  });

  it('offers Editar for every item, and Terminar only for items without an end month', () => {
    const html = render(items);
    expect(html.match(/>Editar</g)).toHaveLength(2);
    expect(html.match(/>Terminar</g)).toHaveLength(1);
  });

  it('marks an item whose end month has passed as terminated, and not one still running', () => {
    expect(render(items, '2026-08')).toContain('Terminado');
    expect(render(items, '2026-05')).not.toContain('Terminado');
    expect(render(items, '2026-05')).not.toContain('ended-row');
  });

  it('shows a message when there are no items', () => {
    const html = render([]);
    expect(html).toContain('Todavía no hay fijos');
    expect(html).not.toContain('<table');
  });
});

describe('RecurringForm', () => {
  const categories: CategoryDto[] = [
    { id: 1, name: 'Nómina ficticia', kind: 'income' },
    { id: 2, name: 'Vivienda', kind: 'expense' },
    { id: 3, name: 'Amortización extra', kind: 'repayment' },
  ];
  it('offers the debts for a repayment, "Ninguna" first, and not for other kinds', () => {
    const debts = [{ id: 4, name: 'Préstamo de ejemplo' }];
    const repayment = render({
      values: { ...emptyRecurringForm('2026-03'), kind: 'repayment', debtId: '4' },
      debts,
    });
    expect(repayment).toContain('Deuda (opcional)');
    expect(repayment).toMatch(
      /<option value="">Ninguna<\/option><option value="4" selected="">Préstamo de ejemplo/,
    );
    expect(render({ debts })).not.toContain('Deuda (opcional)');
    // No debts at all: nothing to choose.
    expect(
      render({ values: { ...emptyRecurringForm('2026-03'), kind: 'repayment' }, debts: [] }),
    ).not.toContain('Deuda (opcional)');
  });

  const render = (props: Partial<Parameters<typeof RecurringForm>[0]> = {}) =>
    renderToStaticMarkup(
      <RecurringForm
        values={emptyRecurringForm('2026-03')}
        categories={categories}
        errors={{}}
        editing={false}
        onChange={noop}
        onSubmit={noop}
        onInvalid={noop}
        onCancel={noop}
        {...props}
      />,
    );

  it('has the fields of a fixed item, with the start month defaulting to the given one', () => {
    const html = render();
    for (const label of [
      'Tipo',
      'Categoría',
      'Concepto',
      'Importe previsto (€)',
      'Día del mes',
      'Desde (mes)',
      'Hasta (mes, opcional)',
      'Notas',
    ]) {
      expect(html).toContain(`>${label}<`);
    }
    expect(html).toContain('value="2026-03"');
    expect(html).toContain('Añadir fijo');
  });

  it('lists only the categories of the selected kind', () => {
    const html = render();
    expect(html).toContain('Vivienda');
    expect(html).not.toContain('Nómina ficticia');
    expect(html).not.toContain('Amortización extra');
  });

  it('shows each error next to its field, linked for screen readers', () => {
    const html = render({
      errors: { expectedDay: 'Día no válido.', endMonth: 'Mes final no válido.' },
    });
    expect(html).toContain('id="recurring-expectedDay-error"');
    expect(html).toContain('aria-describedby="recurring-expectedDay-error"');
    expect(html).toContain('Día no válido.');
    expect(html).toContain('Mes final no válido.');
    expect(html).not.toContain('recurring-amount-error');
  });

  it('switches its texts when editing', () => {
    const html = render({ editing: true });
    expect(html).toContain('Editar fijo');
    expect(html).toContain('Guardar cambios');
    expect(html).toContain('Cancelar');
    expect(render()).not.toContain('Cancelar');
  });
});

describe('Navigation', () => {
  const render = (view: 'movements' | 'recurring') =>
    renderToStaticMarkup(<Navigation view={view} />);

  it('has the two sections and marks the current one', () => {
    const movements = render('movements');
    expect(movements).toContain('>Movimientos<');
    expect(movements).toContain('>Fijos<');
    expect(movements.match(/aria-current="page"/g)).toHaveLength(1);
    expect(movements).toMatch(/aria-current="page"[^>]*>Movimientos</);

    expect(render('recurring')).toMatch(/aria-current="page"[^>]*>Fijos</);
  });
});
