import { expect, test } from '@playwright/test';

// The installable app in production mode (task 0014): the server serves the manifest and the
// icons, and Chromium itself reports no reason why the page could not be installed. Playwright
// cannot click the browser's "Install" button; the manual test in the PR covers that.

const PNG_SIGNATURE = '89504e470d0a1a0a';

test('serves the manifest with the name, standalone display and icons', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/json/);
  const manifest = (await response.json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; purpose: string }[];
  };
  expect(manifest).toMatchObject({ name: 'Personal OS', display: 'standalone', start_url: '/' });
  expect(manifest.icons.map((i) => `${i.sizes}/${i.purpose}`)).toEqual(
    expect.arrayContaining(['192x192/any', '512x512/any', '512x512/maskable']),
  );
});

test('serves every icon of the manifest as a PNG of the declared size', async ({ request }) => {
  const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
    icons: { src: string; sizes: string }[];
  };
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.status(), icon.src).toBe(200);
    expect(response.headers()['content-type'], icon.src).toBe('image/png');
    const bytes = await response.body();
    expect(bytes.subarray(0, 8).toString('hex'), icon.src).toBe(PNG_SIGNATURE);
    const [width] = icon.sizes.split('x').map(Number);
    expect(bytes.readUInt32BE(16), icon.src).toBe(width);
  }
  expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
  // An unknown icon is not served as an image (the server's page fallback answers instead).
  expect((await request.get('/icons/nope.png')).headers()['content-type']).not.toBe('image/png');
});

test('the page links the manifest and Chromium finds nothing blocking the install', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1f6feb');

  const session = await page.context().newCDPSession(page);
  const result = (await session.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[];
  };
  expect(result.installabilityErrors.map((e) => e.errorId)).toEqual([]);

  // No service worker is registered: the app always talks to the live server.
  const workers = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistrations()).length,
  );
  expect(workers).toBe(0);
});
