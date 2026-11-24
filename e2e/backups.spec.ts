import { expect, test } from '@playwright/test';

// In-app backups in production mode (ADR-0003). The e2e server (prod-server.ts) runs against a
// temporary data directory with an unreachable backup mirror, so the app must keep working, have
// taken its startup backup locally, and show the warning.

test('the startup backup exists and the unreachable mirror is reported by the API', async ({
  request,
}) => {
  const response = await request.get('/api/backups/status');
  expect(response.status()).toBe(200);
  const status = (await response.json()) as {
    enabled: boolean;
    lastBackupAt: string | null;
    localCount: number;
    mirror: { configured: boolean; state: string };
    warnings: string[];
  };
  expect(status.enabled).toBe(true);
  expect(status.localCount).toBeGreaterThanOrEqual(1);
  expect(status.lastBackupAt).not.toBeNull();
  expect(status.mirror).toMatchObject({ configured: true, state: 'error' });
  expect(status.warnings).toHaveLength(1);
});

test('the warning banner is visible on every screen and the app still works', async ({ page }) => {
  await page.goto('/');
  const banner = page.getByRole('status', { name: 'Aviso de copias de seguridad' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('copia de reserva');
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();

  await page
    .getByRole('navigation', { name: 'Secciones' })
    .getByRole('button', { name: 'Categorías' })
    .click();
  await expect(banner).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Categorías', level: 1 })).toBeVisible();
});
