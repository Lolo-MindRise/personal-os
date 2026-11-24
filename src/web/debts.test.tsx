import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CategoryDto, DebtDto } from '../shared/api.js';
import { Navigation } from './App.js';
import { createApiClient } from './api.js';
import {
  applyDebtChange,
  emptyDebtForm,
  formFromDebt,
  mapDebtApiErrors,
  validateDebtForm,
} from './debtForm.js';
import { DebtForm, DebtList } from './DebtsPage.js';
import { MovementForm } from './MovementForm.js';
import { emptyForm } from './movementForm.js';

const noop = () => undefined;

const debt: DebtDto = {
  id: 1,
  name: 'Préstamo de ejemplo',
  monthlyPaymentCents: 15_000,
  balanceCents: 300_000,
  balanceAsOf: '2026-01-31',
  remainingInstallments: 20,
  annualRateBps: 650,
  notes: 'Datos inventados',
  repayments: [
    { movementId: 9, date: '2026-02-10', concept: 'Extra de febrero', amountCents: 20_000 },
    { movementId: 8, date: '2026-01-25', concept: 'Extra de enero', amountCents: 10_000 },
  ],
  repaidSinceCents: 20_000,
  estimatedBalanceCents: 280_000,
  principalPaidCents: 0,
  interestPaidCents: 0,
  installments: [],
};

describe('DebtList', () => {
  const html = renderToStaticMarkup(<DebtList debts={[debt]} onEdit={noop} />);

  it('shows balance and its date, estimate, payment, installments, rate', () => {
    expect(html).toContain('Préstamo de ejemplo');
    expect(html).toMatch(/Saldo estimado hoy<\/dt><dd class="debt-estimate">2\.800,00\s€/);
    expect(html).toMatch(/3\.000,00\s€/);
    expect(html).toContain('a fecha 31/01/2026');
    expect(html).toMatch(/150,00\s€/);
    expect(html).toContain('Cuotas restantes</dt><dd>20');
    expect(html).toContain('6,50 %');
    expect(html).toContain('Datos inventados');
  });

  it('lists linked repayments, marking those before the recorded balance as not deducted', () => {
    expect(html).toContain('Amortizaciones extra vinculadas (2)');
    expect(html).toContain('10/02/2026 · Extra de febrero');
    expect(html).toContain('25/01/2026');
    expect(html.match(/no se descuenta/g)).toHaveLength(1);
  });

  it('shows principal and interest of the confirmed installments, and the old notice is gone', () => {
    const withInstallments = renderToStaticMarkup(
      <DebtList
        debts={[
          {
            ...debt,
            principalPaidCents: 81_066,
            interestPaidCents: 5_000,
            installments: [
              {
                movementId: 5,
                date: '2026-02-01',
                paidCents: 86_066,
                interestCents: 5_000,
                principalCents: 81_066,
                balanceAfterCents: 218_934,
              },
            ],
          },
        ]}
        onEdit={noop}
      />,
    );
    expect(withInstallments).toMatch(/Intereses pagados en cuotas<\/dt><dd[^>]*>50,00\s€/);
    expect(withInstallments).toMatch(/Capital amortizado en cuotas<\/dt><dd>810,66\s€/);
    expect(withInstallments).toContain('Cuotas confirmadas (1)');
    expect(withInstallments).toMatch(/intereses 50,00\s€, capital 810,66\s€/);
    expect(html).toContain('Sin cuotas confirmadas desde esa fecha');
    expect(html).not.toContain('no se descuentan automáticamente');
    expect(renderToStaticMarkup(<DebtList debts={[debt]} onEdit={noop} />)).not.toContain(
      'no se descuentan automáticamente',
    );
  });

  it('says so when no repayment is linked, and when there are no debts', () => {
    const none = renderToStaticMarkup(
      <DebtList debts={[{ ...debt, repayments: [], repaidSinceCents: 0 }]} onEdit={noop} />,
    );
    expect(none).toContain('Sin amortizaciones extra vinculadas.');
    expect(renderToStaticMarkup(<DebtList debts={[]} onEdit={noop} />)).toContain(
      'Todavía no hay deudas',
    );
  });
});

describe('DebtForm', () => {
  const render = (editing: boolean) =>
    renderToStaticMarkup(
      <DebtForm
        values={emptyDebtForm('2026-02-01')}
        errors={{ balance: 'Introduce un importe.' }}
        formError="Algo falló"
        editing={editing}
        busy={false}
        onChange={noop}
        onSubmit={noop}
        onCancel={noop}
      />,
    );

  it('has every field, with the errors linked', () => {
    const html = render(false);
    for (const label of [
      'Nombre',
      'Saldo pendiente',
      'Saldo a fecha de',
      'Cuota mensual',
      'Cuotas restantes',
      'Interés anual',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Añadir deuda');
    expect(html).toContain('aria-describedby="debt-balance-error"');
    expect(html).toContain('Algo falló');
  });

  it('explains the new as-of date when editing', () => {
    const html = render(true);
    expect(html).toContain('Editar deuda');
    expect(html).toContain('la fecha del saldo pasa a ser la de hoy');
    expect(html).toContain('Cancelar');
  });
});

describe('validateDebtForm', () => {
  const filled = {
    name: ' Tarjeta ',
    monthlyPayment: '50',
    balance: '1.200,50',
    balanceAsOf: '2026-02-01',
    remainingInstallments: '24',
    rate: '19,99',
    notes: ' ',
  };

  it('builds the payload in cents and basis points', () => {
    expect(validateDebtForm(filled)).toEqual({
      ok: true,
      payload: {
        name: 'Tarjeta',
        monthlyPaymentCents: 5_000,
        balanceCents: 120_050,
        balanceAsOf: '2026-02-01',
        remainingInstallments: 24,
        annualRateBps: 1_999,
        notes: null,
      },
    });
  });

  it('accepts a zero balance (paid off) and a zero rate, but not a zero payment', () => {
    expect(validateDebtForm({ ...filled, balance: '0', rate: '0' }).ok).toBe(true);
    const result = validateDebtForm({ ...filled, monthlyPayment: '0' });
    expect(result.ok).toBe(false);
  });

  it('reports every invalid field in Spanish', () => {
    const result = validateDebtForm({
      name: '',
      monthlyPayment: '',
      balance: 'x',
      balanceAsOf: '2026-02-30',
      remainingInstallments: '-1',
      rate: 'mucho',
      notes: '',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        'balance',
        'balanceAsOf',
        'monthlyPayment',
        'name',
        'rate',
        'remainingInstallments',
      ]);
    }
  });

  it('round-trips a stored debt through the form', () => {
    const result = validateDebtForm(formFromDebt(debt));
    expect(result.ok && result.payload).toMatchObject({
      balanceCents: 300_000,
      annualRateBps: 650,
      remainingInstallments: 20,
      balanceAsOf: '2026-01-31',
    });
  });

  it('maps API field names to form fields', () => {
    expect(mapDebtApiErrors({ balanceAsOf: 'a', annualRateBps: 'b', other: 'c' })).toEqual({
      balanceAsOf: 'a',
      rate: 'b',
    });
  });
});

describe('applyDebtChange: editing the balance records a new as-of date', () => {
  const original = formFromDebt(debt);
  const today = '2026-03-10';

  it('sets the date to today when the balance is edited and the date was untouched', () => {
    const next = applyDebtChange(original, { ...original, balance: '2.500,00' }, original, today);
    expect(next.balanceAsOf).toBe('2026-03-10');
  });

  it('leaves a date the user already changed alone', () => {
    const touched = { ...original, balanceAsOf: '2026-02-20' };
    const next = applyDebtChange(touched, { ...touched, balance: '2.500,00' }, original, today);
    expect(next.balanceAsOf).toBe('2026-02-20');
  });

  it('does nothing for other fields, when adding, or when the balance returns to its value', () => {
    expect(
      applyDebtChange(original, { ...original, name: 'Otro' }, original, today).balanceAsOf,
    ).toBe('2026-01-31');
    const added = emptyDebtForm('2026-03-01');
    expect(applyDebtChange(added, { ...added, balance: '5' }, undefined, today).balanceAsOf).toBe(
      '2026-03-01',
    );
    const edited = applyDebtChange(original, { ...original, balance: '1' }, original, today);
    const back = applyDebtChange(edited, { ...edited, balance: original.balance }, original, today);
    expect(back.balance).toBe(original.balance);
  });
});

describe('MovementForm: linking a repayment to a debt', () => {
  const categories: CategoryDto[] = [{ id: 6, name: 'Amortización extra', kind: 'repayment' }];
  const render = (kind: 'repayment' | 'expense', mode: 'add' | 'confirm' = 'add', debtId = '') =>
    renderToStaticMarkup(
      <MovementForm
        values={{ ...emptyForm('2026-02-01'), kind, debtId }}
        categories={categories}
        debts={[{ id: 1, name: 'Préstamo de ejemplo' }]}
        errors={{}}
        mode={mode}
        onChange={noop}
        onSubmit={noop}
        onInvalid={noop}
        onCancel={noop}
      />,
    );

  it('offers the debts for a repayment, with "Sin deuda" first', () => {
    const html = render('repayment');
    expect(html).toContain('Deuda (opcional)');
    expect(html).toContain('Sin deuda');
    expect(html).toContain('Préstamo de ejemplo');
    expect(html.indexOf('Sin deuda')).toBeLessThan(html.indexOf('Préstamo de ejemplo'));
  });

  it('does not offer a debt for other kinds, nor when confirming a fixed item', () => {
    expect(render('expense')).not.toContain('Deuda (opcional)');
    expect(render('repayment', 'confirm')).not.toContain('Deuda (opcional)');
  });

  it('marks the linked debt as selected when editing', () => {
    expect(render('repayment', 'add', '1')).toMatch(/<option value="1" selected="">Préstamo/);
  });
});

describe('navigation and api client: debts', () => {
  it('has a Deudas section', () => {
    expect(renderToStaticMarkup(<Navigation view="debts" />)).toContain('Deudas');
  });

  it('uses the right URLs and methods', async () => {
    const fetchFn = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    );
    const api = createApiClient(fetchFn);
    await api.debts();
    await api.createDebt({
      name: 'X',
      monthlyPaymentCents: 1,
      balanceCents: 0,
      balanceAsOf: '2026-01-01',
      remainingInstallments: 0,
      annualRateBps: 0,
      notes: null,
    });
    await api.updateDebt(4, { balanceCents: 5, balanceAsOf: '2026-02-01' });
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/debts');
    expect(fetchFn.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
    expect(fetchFn.mock.calls[2]).toEqual([
      '/api/debts/4',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ balanceCents: 5, balanceAsOf: '2026-02-01' }),
      }),
    ]);
  });
});
