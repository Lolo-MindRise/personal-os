import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AccountDto } from '../shared/api.js';
import { emptyReconcileForm, validateReconcileForm } from './accountForms.js';
import { createApiClient } from './api.js';
import { differenceText, ReconcilePanel } from './ReconcilePanel.js';
import { todayISO } from './months.js';

const account: AccountDto = {
  id: 2,
  name: 'Efectivo',
  type: 'cash',
  openingBalanceCents: 0,
  openingBalanceDate: '2026-01-31',
};

describe('validateReconcileForm', () => {
  it('defaults the date to today', () => {
    expect(emptyReconcileForm('2026-03-01')).toEqual({ bankBalance: '', date: '2026-03-01' });
    expect(emptyReconcileForm().date).toBe(todayISO());
  });

  it('turns the typed balance (signed) into cents', () => {
    expect(validateReconcileForm({ bankBalance: '1.234,50', date: '2026-02-10' }, account)).toEqual(
      {
        ok: true,
        payload: { date: '2026-02-10', bankBalanceCents: 123_450 },
      },
    );
    expect(
      validateReconcileForm({ bankBalance: '-20', date: '2026-02-10' }, account),
    ).toMatchObject({
      ok: true,
      payload: { bankBalanceCents: -2_000 },
    });
  });

  it('accepts the opening date and refuses an earlier one with a clear message', () => {
    expect(validateReconcileForm({ bankBalance: '0', date: '2026-01-31' }, account).ok).toBe(true);
    const early = validateReconcileForm({ bankBalance: '0', date: '2026-01-30' }, account);
    expect(early.ok).toBe(false);
    if (!early.ok) {
      expect(early.errors.date).toBe(
        'La fecha no puede ser anterior a la fecha del saldo inicial de la cuenta «Efectivo» (31/01/2026).',
      );
    }
  });

  it('refuses an empty or invalid balance and an invalid date', () => {
    const bad = validateReconcileForm({ bankBalance: 'abc', date: '' }, account);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors.bankBalance).toBeDefined();
      expect(bad.errors.date).toBeDefined();
    }
    expect(validateReconcileForm({ bankBalance: '', date: '2026-02-10' }, account).ok).toBe(false);
  });
});

describe('differenceText', () => {
  it('says who has more, in plain words', () => {
    expect(differenceText(0)).toMatch(/no hay diferencia/);
    expect(differenceText(1_000)).toMatch(/banco tiene 10,00.*más que la app/);
    expect(differenceText(-1_000)).toMatch(/banco tiene 10,00.*menos que la app/);
  });
});

describe('ReconcilePanel', () => {
  it('shows its fields and says that nothing is adjusted automatically', () => {
    const html = renderToStaticMarkup(
      <ReconcilePanel
        api={createApiClient(vi.fn())}
        account={account}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain('Saldo real del banco');
    expect(html).toContain('Fecha del saldo del banco');
    expect(html).toContain('nunca crea ajustes automáticos');
    expect(html).toContain('Guardar conciliación');
  });
});

describe('api client', () => {
  it('asks for the preview of an account at a date and saves as JSON', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));
    const api = createApiClient(fetchFn);
    await api.reconciliationPreview(2, '2026-02-10');
    await api.createReconciliation(2, { date: '2026-02-10', bankBalanceCents: 100 });
    const calls = fetchFn.mock.calls as unknown as [string, RequestInit | undefined][];
    expect(calls[0]?.[0]).toBe('/api/accounts/2/reconciliation-preview?date=2026-02-10');
    expect(calls[1]?.[0]).toBe('/api/accounts/2/reconciliations');
    expect(calls[1]?.[1]?.method).toBe('POST');
  });
});
