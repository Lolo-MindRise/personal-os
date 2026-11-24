import { expect, test } from '@playwright/test';

// Dev mode (`npm run dev`): the page is served by Vite and /api is proxied to
// Fastify. The task 0005 bug (module /api.ts proxied to the API, blank page)
// lived here, and unit tests, typecheck and build cannot see it.
test('the dev page renders and no request fails', async ({ page }) => {
  const problems: string[] = [];
  page.on('response', (response) => {
    if (response.status() >= 400) {
      problems.push(`${String(response.status())} ${response.url()}`);
    }
  });
  page.on('requestfailed', (request) => {
    problems.push(`failed ${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`);
  });
  page.on('pageerror', (error) => {
    problems.push(`page error: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') {
      problems.push(`console error: ${message.text()}`);
    }
  });

  // The API must be reached through the proxy, not just the static modules.
  // Never throws: a missing answer is reported after the more telling checks.
  const categories = page
    .waitForResponse((response) => response.url().endsWith('/api/categories') && response.ok(), {
      timeout: 10_000,
    })
    .catch(() => undefined);

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // First, so a broken module (e.g. "404 .../api.ts") is named in the failure.
  expect(problems, 'failed requests and errors').toEqual([]);
  await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Añadir movimiento' })).toBeVisible();
  expect(await categories, '/api/categories answered through the proxy').toBeDefined();
});
