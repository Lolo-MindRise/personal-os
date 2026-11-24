/**
 * Dev-server proxy rules. Vite treats a key as a plain prefix unless it starts
 * with `^`, so a bare `/api` would also capture the module `/api.ts` and send
 * it to the API server (404, blank page). Anchor to `/api/` instead.
 */
export const API_PROXY_KEY = '^/api/';

export function apiProxy(apiPort: string): Record<string, string> {
  return { [API_PROXY_KEY]: `http://127.0.0.1:${apiPort}` };
}
