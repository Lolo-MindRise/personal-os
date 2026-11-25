import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AccountDto, ReconciliationPreviewDto } from '../shared/api.js';
import { deleteAccountConfirmText, reconcileRows, visiblePreview } from './reconcileView.js';
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
        nameOf={() => 'X'}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain('Saldo real del banco');
    expect(html).toContain('Fecha del saldo del banco');
    expect(html).toContain('nunca crea ajustes automáticos');
    expect(html).toContain('Guardar conciliación');
    // No preview yet for the (valid) default date: loading, no result or difference.
    expect(html).toContain('Cargando…');
    expect(html).not.toContain('Resultado de la conciliación');
  });
});

const preview: ReconciliationPreviewDto = {
  accountId: 2,
  date: '2026-02-10',
  appBalanceCents: 1_000,
  last: null,
  movements: [
    { id: 7, date: '2026-02-05', kind: 'expense', concept: 'Café', amountCents: 250 },
    { id: 3, date: '2026-02-06', kind: 'income', concept: 'Nómina', amountCents: 10_000 },
    { id: 4, date: '2026-02-06', kind: 'repayment', concept: 'Préstamo', amountCents: 500 },
  ],
  transfers: [
    {
      id: 1,
      date: '2026-02-06',
      amountCents: 4_000,
      fromAccountId: 2,
      toAccountId: 1,
      notes: null,
    },
    { id: 2, date: '2026-02-03', amountCents: 700, fromAccountId: 1, toAccountId: 2, notes: null },
  ],
};

describe('visiblePreview', () => {
  it('shows a preview only for the date currently chosen', () => {
    expect(visiblePreview(preview, '2026-02-10')).toBe(preview);
    expect(visiblePreview(preview, '2026-02-11')).toBeUndefined();
    expect(visiblePreview(preview, undefined)).toBeUndefined();
    expect(visiblePreview(undefined, '2026-02-10')).toBeUndefined();
  });
});

describe('reconcileRows', () => {
  it('merges movements and transfers by date, then kind, then id, with direction and other account', () => {
    const names = new Map([
      [1, 'Principal'],
      [2, 'Efectivo'],
    ]);
    const rows = reconcileRows(preview, 2, (id) => names.get(id) ?? '—');
    expect(rows.map((r) => r.key)).toEqual(['t2', 'm7', 'm3', 'm4', 't1']);
    expect(rows[0]?.text).toContain('Transferencia desde «Principal»');
    expect(rows[0]?.text).toContain('+7,00');
    expect(rows[1]?.text).toContain('−2,50');
    expect(rows[2]?.text).toContain('+100,00');
    expect(rows[3]?.text).toContain('−5,00');
    expect(rows[4]?.text).toContain('Transferencia a «Principal»');
    expect(rows[4]?.text).toContain('−40,00');
  });
});

describe('delete account confirmation', () => {
  it('mentions the reconciliation records only when there are some', () => {
    expect(deleteAccountConfirmText('Efectivo', 0)).toBe('¿Eliminar la cuenta «Efectivo»?');
    expect(deleteAccountConfirmText('Efectivo', 1)).toBe(
      '¿Eliminar la cuenta «Efectivo»? Se borrará también su conciliación.',
    );
    expect(deleteAccountConfirmText('Efectivo', 3)).toBe(
      '¿Eliminar la cuenta «Efectivo»? Se borrarán también sus 3 conciliaciones.',
    );
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
