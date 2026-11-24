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
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  // The dev database may be empty or seeded: the key figures show either way.
  await expect(page.getByRole('region', { name: 'Cifras clave' })).toBeVisible();

  // The other screens still load through the proxy.
  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('link', { name: 'Movimientos' })
    .click();
  await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Añadir movimiento' })).toBeVisible();
  expect(await categories, '/api/categories answered through the proxy').toBeDefined();
});

// The app icons are drawn in code; the dev server serves them through a Vite middleware
// (production gets them from the build, see installable.spec.ts).
test('the dev server serves the manifest and the generated icons', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect(((await manifest.json()) as { name: string }).name).toBe('Personal OS');
  for (const [file, width] of [
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['icon-maskable-512.png', 512],
    ['apple-touch-icon.png', 180],
  ] as const) {
    const response = await request.get(`/icons/${file}`);
    expect(response.status(), file).toBe(200);
    expect(response.headers()['content-type'], file).toBe('image/png');
    const bytes = await response.body();
    expect(bytes.subarray(0, 8).toString('hex'), file).toBe('89504e470d0a1a0a');
    expect(bytes.readUInt32BE(16), file).toBe(width);
  }
});
