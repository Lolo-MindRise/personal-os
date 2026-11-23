import { describe, expect, it } from 'vitest';
import { fetchHealth } from './health.js';

function fakeFetch(response: Response | Error): typeof fetch {
  return () => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response));
}

describe('fetchHealth', () => {
  it('returns ok when the server answers status ok', async () => {
    const response = Response.json({ status: 'ok' });
    expect(await fetchHealth(fakeFetch(response))).toBe('ok');
  });

  it('returns error on a non-2xx response', async () => {
    const response = new Response('boom', { status: 500 });
    expect(await fetchHealth(fakeFetch(response))).toBe('error');
  });

  it('returns error on an unexpected body', async () => {
    const response = Response.json({ status: 'down' });
    expect(await fetchHealth(fakeFetch(response))).toBe('error');
  });

  it('returns error when the request fails', async () => {
    expect(await fetchHealth(fakeFetch(new Error('offline')))).toBe('error');
  });
});
