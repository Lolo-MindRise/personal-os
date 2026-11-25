import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { AccountDto } from '../shared/api.js';
import {
  accountToForm,
  emptyAccountForm,
  emptyTransferForm,
  parseSignedMoney,
  validateAccountForm,
  validateTransferForm,
} from './accountForms.js';
import { createApiClient } from './api.js';
import { AccountForm, TransferForm } from './AccountsPage.js';
import { NAV_GROUPS } from './App.js';

const accounts: AccountDto[] = [
  {
    id: 1,
    name: 'Principal',
    type: 'bank',
    openingBalanceCents: 0,
    openingBalanceDate: '2026-01-01',
  },
  {
    id: 2,
    name: 'Efectivo',
    type: 'cash',
    openingBalanceCents: -5000,
    openingBalanceDate: '2026-01-01',
  },
];

describe('parseSignedMoney', () => {
  it('accepts zero, positive and negative amounts', () => {
    expect(parseSignedMoney('0')).toEqual({ ok: true, cents: 0 });
    expect(parseSignedMoney('12,50')).toEqual({ ok: true, cents: 1250 });
    expect(parseSignedMoney('-12,50')).toEqual({ ok: true, cents: -1250 });
  });
  it('rejects text', () => {
    expect(parseSignedMoney('abc').ok).toBe(false);
  });
});

describe('account form', () => {
  it('builds the payload', () => {
    const result = validateAccountForm({
      ...emptyAccountForm('2026-02-01'),
      name: '  Hucha ',
      type: 'savings',
      openingBalance: '-1.000,00',
    });
    expect(result).toEqual({
      ok: true,
      payload: {
        name: 'Hucha',
        type: 'savings',
        openingBalanceCents: -100_000,
        openingBalanceDate: '2026-02-01',
      },
    });
  });
  it('reports every wrong field', () => {
    const result = validateAccountForm({
      name: ' ',
      type: 'bank',
      openingBalance: 'x',
      openingDate: '',
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? {} : Object.keys(result.errors).sort()).toEqual([
      'name',
      'openingBalance',
      'openingDate',
    ]);
  });
  it('round-trips a negative balance', () => {
    const second = accounts[1];
    expect(second).toBeDefined();
    expect(accountToForm(second as AccountDto).openingBalance).toBe('-50,00');
  });
  it('labels follow the glossary', () => {
    const html = renderToStaticMarkup(
      <AccountForm
        values={emptyAccountForm('2026-02-01')}
        errors={{}}
        busy={false}
        formError={undefined}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain('Saldo inicial de la cuenta');
    expect(html).toContain('Cuenta bancaria');
  });
});

describe('transfer form', () => {
  const valid = {
    ...emptyTransferForm(accounts, '2026-02-10'),
    amount: '100',
    notes: ' ',
  };
  it('builds the payload with origin and destination', () => {
    expect(validateTransferForm(valid)).toEqual({
      ok: true,
      payload: {
        date: '2026-02-10',
        amountCents: 10_000,
        fromAccountId: 1,
        toAccountId: 2,
        notes: null,
      },
    });
  });
  it('requires different accounts and a positive amount', () => {
    const same = validateTransferForm({ ...valid, toAccountId: '1' });
    expect(same.ok ? undefined : same.errors.toAccountId).toMatch(/distintas/);
    expect(validateTransferForm({ ...valid, amount: '0' }).ok).toBe(false);
    expect(validateTransferForm({ ...valid, amount: '' }).ok).toBe(false);
  });
  it('renders both account selectors', () => {
    const html = renderToStaticMarkup(
      <TransferForm
        values={valid}
        errors={{}}
        accounts={accounts}
        busy={false}
        formError={undefined}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(html).toContain('Cuenta de origen');
    expect(html).toContain('Cuenta de destino');
    expect(html).toContain('Efectivo');
  });
});

describe('api client and navigation', () => {
  it('sends a transfer as JSON', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('{}', { status: 201 })));
    await createApiClient(fetchFn).createTransfer({
      date: '2026-02-10',
      amountCents: 100,
      fromAccountId: 1,
      toAccountId: 2,
      notes: null,
    });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/transfers');
    expect(init.method).toBe('POST');
  });
  it('has Cuentas under Ajustes', () => {
    const ajustes = NAV_GROUPS.find((g) => g.title === 'Ajustes');
    expect(ajustes?.items.map((i) => i.label)).toContain('Cuentas');
  });
});
