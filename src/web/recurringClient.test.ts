import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './api.js';
import { formFromEntry, toConfirmPayload, validateMovementForm } from './movementForm.js';
import { formatMonth } from './months.js';

const reply = (status: number, body?: unknown) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );

const recurring = {
  kind: 'expense' as const,
  categoryId: 2,
  concept: 'Alquiler',
  amountCents: 70_000,
  expectedDay: 2,
  startMonth: '2026-01',
  endMonth: null,
  notes: null,
  debtId: null,
};

describe('api client: recurring items', () => {
  it('reads items, pending and skipped entries from the right URLs', async () => {
    const fetchFn = reply(200, []);
    const api = createApiClient(fetchFn);
    await api.recurringItems();
    await api.pending('2026-01');
    await api.skipped('2026-01');
    expect(fetchFn.mock.calls.map((call) => call[0])).toEqual([
      '/api/recurring-items',
      '/api/months/2026-01/pending',
      '/api/months/2026-01/skipped',
    ]);
  });

  it('creates and updates an item with JSON bodies', async () => {
    const fetchFn = reply(200, { id: 7 });
    const api = createApiClient(fetchFn);
    await api.createRecurring(recurring);
    await api.updateRecurring(7, { endMonth: '2026-06' });
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/recurring-items');
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(recurring),
    });
    expect(fetchFn.mock.calls[1]?.[0]).toBe('/api/recurring-items/7');
    expect(fetchFn.mock.calls[1]?.[1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ endMonth: '2026-06' }),
    });
  });

  it('confirms one item for a month with its overrides, and confirms all with POST', async () => {
    const fetchFn = reply(201, { id: 1 });
    const api = createApiClient(fetchFn);
    const overrides = { date: '2026-01-10', amountCents: 4_000, concept: 'Internet', notes: null };
    await api.confirmRecurring(3, '2026-01', overrides);
    await api.confirmAll('2026-01');
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/recurring-items/3/months/2026-01/confirm');
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(overrides),
    });
    expect(fetchFn.mock.calls[1]?.[0]).toBe('/api/months/2026-01/confirm-all');
    expect(fetchFn.mock.calls[1]?.[1]).toMatchObject({ method: 'POST' });
  });

  it('skips with POST and undoes the skip with DELETE', async () => {
    const fetchFn = reply(204);
    const api = createApiClient(fetchFn);
    await api.skipRecurring(3, '2026-01');
    await api.undoSkip(3, '2026-01');
    expect(fetchFn).toHaveBeenNthCalledWith(1, '/api/recurring-items/3/months/2026-01/skip', {
      method: 'POST',
    });
    expect(fetchFn).toHaveBeenNthCalledWith(2, '/api/recurring-items/3/months/2026-01/skip', {
      method: 'DELETE',
    });
  });

  it('turns a 409 on confirm into an ApiError with the server message', async () => {
    const api = createApiClient(reply(409, { error: 'Este fijo ya está confirmado en ese mes.' }));
    const error = await api
      .confirmRecurring(3, '2026-01', {
        date: '2026-01-10',
        amountCents: 1,
        concept: 'x',
        notes: null,
      })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Este fijo ya está confirmado en ese mes.');
  });
});

describe('confirming through the movement form', () => {
  const entry = {
    recurringItemId: 3,
    month: '2026-01',
    date: '2026-01-10',
    kind: 'expense' as const,
    categoryId: 4,
    categoryName: 'Suministros',
    concept: 'Internet',
    amountCents: 3_500,
    notes: null,
    heldByTrash: false,
  };

  it('pre-fills the form with the expected values of the entry', () => {
    expect(formFromEntry(entry)).toEqual({
      date: '2026-01-10',
      kind: 'expense',
      categoryId: '4',
      concept: 'Internet',
      amount: '35,00',
      notes: '',
      debtId: '',
    });
  });

  it('a pre-filled form is valid as it is, and sends only what may be overridden', () => {
    const result = validateMovementForm(formFromEntry(entry));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(toConfirmPayload(result.payload)).toEqual({
        date: '2026-01-10',
        amountCents: 3_500,
        concept: 'Internet',
        notes: null,
      });
    }
  });

  it('sends the amount the user changed, in cents', () => {
    const changed = { ...formFromEntry(entry), amount: '41,27' };
    const result = validateMovementForm(changed);
    expect(result.ok && toConfirmPayload(result.payload).amountCents).toBe(4_127);
  });
});

describe('formatMonth', () => {
  it('shows a month as MM/AAAA', () => {
    expect(formatMonth('2026-06')).toBe('06/2026');
    expect(formatMonth('2027-12')).toBe('12/2027');
  });
});
