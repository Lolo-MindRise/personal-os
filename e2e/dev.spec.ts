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

  // The API is reached through the proxy, not just the static modules.
  const categories = page.waitForResponse(
    (response) => response.url().endsWith('/api/categories') && response.ok(),
  );
  await page.goto('/');
  await categories;

  await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Añadir movimiento' })).toBeVisible();
  await page.waitForLoadState('networkidle');

  expect(problems).toEqual([]);
});
