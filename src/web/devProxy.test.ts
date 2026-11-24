import { describe, expect, it } from 'vitest';
import { API_PROXY_KEY, apiProxy } from './devProxy.js';

// Vite uses a key that starts with `^` as a RegExp, matched against the request URL.
const proxied = (url: string) => new RegExp(API_PROXY_KEY).test(url);

describe('dev proxy', () => {
  it.each(['/api/health', '/api/movements?month=2026-01', '/api/months/2026-01/summary'])(
    'sends %s to the API server',
    (url) => {
      expect(proxied(url)).toBe(true);
    },
  );

  // Regression: `/api.ts` was proxied to Fastify and returned 404, blanking the page.
  it.each([
    '/api.ts',
    '/api.test.ts',
    '/api',
    '/apiClient.ts',
    '/MovementsPage.tsx',
    '/src/web/api.ts',
  ])('serves %s from Vite, not the API', (url) => {
    expect(proxied(url)).toBe(false);
  });

  it('points at the configured API port', () => {
    expect(apiProxy('5399')).toEqual({ [API_PROXY_KEY]: 'http://127.0.0.1:5399' });
  });

  it('keeps every module of the web app clear of the proxy', () => {
    // Lazy glob: only the file names are read, nothing is imported.
    const files = Object.keys(import.meta.glob('./*.{ts,tsx,css}')).map((f) => f.slice(1));
    expect(files).toContain('/api.ts');
    for (const file of files) {
      expect(proxied(file), file).toBe(false);
    }
  });
});
