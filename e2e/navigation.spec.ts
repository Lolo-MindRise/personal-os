import { expect, test, type Page } from '@playwright/test';

// App shell (task 0015, block 1): sidebar, hash routes, selected month, theme. Production mode on
// the seeded database; the browser clock is fixed to January 2026.

const nav = (page: Page) => page.getByRole('navigation', { name: 'Secciones' });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime('2026-01-15T12:00:00');
});

test('every sidebar entry opens its screen with its own URL', async ({ page }) => {
  await page.goto('/');
  const entries: [string, string, RegExp][] = [
    ['Inicio', 'Inicio', /#\/dashboard/],
    ['Movimientos', 'Movimientos', /#\/movements/],
    ['Importar', 'Importar', /#\/import/],
    ['Informes', 'Informes', /#\/reports/],
    ['Presupuesto', 'Presupuesto', /#\/budget/],
    ['Fijos', 'Fijos', /#\/recurring/],
    ['Proyección', 'Proyección', /#\/projection/],
    ['Deudas', 'Deudas', /#\/debts/],
    ['Objetivos y resumen', 'Resumen', /#\/summary/],
    ['Hitos', 'Hitos', /#\/milestones/],
    ['Cuentas', 'Cuentas', /#\/accounts/],
    ['Categorías', 'Categorías', /#\/categories/],
    ['Copias', 'Copias', /#\/backups/],
  ];
  for (const [label, heading, url] of entries) {
    await nav(page).getByRole('link', { name: label }).click();
    await expect(page).toHaveURL(url);
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await expect(nav(page).getByRole('link', { name: label })).toHaveAttribute(
      'aria-current',
      'page',
    );
  }
});

test('reloading keeps the screen, and the back button returns to the previous one', async ({
  page,
}) => {
  await page.goto('/');
  await nav(page).getByRole('link', { name: 'Deudas' }).click();
  await nav(page).getByRole('link', { name: 'Hitos' }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Hitos', level: 1 })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Deudas', level: 1 })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Hitos', level: 1 })).toBeVisible();
});

test('the selected month follows you across monthly screens and lives in the URL', async ({
  page,
}) => {
  await page.goto('/#/budget?month=2026-01');
  await expect(page.getByRole('heading', { name: 'Presupuesto', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Mes anterior' }).click();
  await expect(page).toHaveURL(/#\/budget\?month=2025-12/);
  await expect(page.locator('.month-label')).toHaveText('diciembre de 2025');

  await nav(page).getByRole('link', { name: 'Movimientos' }).click();
  await expect(page).toHaveURL(/#\/movements\?month=2025-12/);
  await expect(page.locator('.month-label')).toHaveText('diciembre de 2025');

  await nav(page).getByRole('link', { name: 'Inicio' }).click();
  await expect(page).toHaveURL(/#\/dashboard\?month=2025-12/);
  await expect(page.locator('.month-label')).toHaveText('diciembre de 2025');

  // Changing the month replaces the history entry: back leaves the screen, not the month.
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.locator('.month-label')).toHaveText('diciembre de 2025');
});

test('the Resumen year lives in the URL and survives a reload', async ({ page }) => {
  await page.goto('/#/summary');
  await expect(page.locator('.year-label')).toHaveText('2026');
  await page.getByRole('button', { name: 'Año anterior' }).click();
  await expect(page).toHaveURL(/#\/summary\?year=2025/);
  await page.reload();
  await expect(page.locator('.year-label')).toHaveText('2025');
  // An invalid year falls back to the current one.
  await page.goto('/#/summary?year=abc');
  await expect(page.locator('.year-label')).toHaveText('2026');
});

test('the theme toggle switches dark and light and is remembered after a reload', async ({
  page,
}) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Cambiar a tema oscuro' }).click();
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');
});
