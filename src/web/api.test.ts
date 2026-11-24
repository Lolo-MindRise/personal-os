import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient, NETWORK_ERROR } from './api.js';

const reply = (status: number, body?: unknown) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    ),
  );

const payload = {
  date: '2026-01-10',
  kind: 'expense' as const,
  categoryId: 3,
  concept: 'Compra',
  amountCents: 1_000,
  notes: null,
};

describe('api client', () => {
  it('returns what the server sends and requests the right URLs', async () => {
    const fetchFn = reply(200, [{ id: 1 }]);
    const api = createApiClient(fetchFn);
    expect(await api.movements('2026-01')).toEqual([{ id: 1 }]);
    expect(fetchFn).toHaveBeenCalledWith('/api/movements?month=2026-01', undefined);
    await api.summary('2026-01');
    expect(fetchFn).toHaveBeenLastCalledWith('/api/months/2026-01/summary', undefined);
  });

  it('sends JSON for create and update, and DELETE for delete', async () => {
    const fetchFn = reply(200, { id: 7 });
    const api = createApiClient(fetchFn);
    await api.createMovement(payload);
    await api.updateMovement(7, payload);
    expect(fetchFn.mock.calls[0]?.[0]).toBe('/api/movements');
    expect(fetchFn.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify(payload),
    });
    expect(fetchFn.mock.calls[1]?.[0]).toBe('/api/movements/7');
    expect(fetchFn.mock.calls[1]?.[1]).toMatchObject({ method: 'PATCH' });

    const deleteFetch = reply(204);
    await createApiClient(deleteFetch).deleteMovement(7);
    expect(deleteFetch).toHaveBeenCalledWith('/api/movements/7', { method: 'DELETE' });
  });

  it('turns an API error into an ApiError with its message and fields', async () => {
    const api = createApiClient(
      reply(400, { error: 'Datos no válidos.', fields: { amountCents: 'mal' } }),
    );
    const error = await api.createMovement(payload).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe(
      'Datos no válidos. Revisa lo escrito y vuelve a intentarlo.',
    );
    expect((error as ApiError).fields).toEqual({ amountCents: 'mal' });
  });

  it('reports a connection failure and a non-JSON answer as the network error', async () => {
    const down = createApiClient(
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
    );
    await expect(down.categories()).rejects.toMatchObject({ message: NETWORK_ERROR });

    const html = createApiClient(
      vi.fn<typeof fetch>(() => Promise.resolve(new Response('<html>', { status: 502 }))),
    );
    await expect(html.categories()).rejects.toMatchObject({ message: NETWORK_ERROR });
  });
});
