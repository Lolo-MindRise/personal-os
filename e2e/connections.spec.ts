import { expect, test, type Page } from '@playwright/test';

// Task 0015, block 2: from a figure, one link to what is behind it, already filtered. Production
// mode, seeded database, browser clock fixed to January 2026 (the seeded month).

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });
const filterBar = (page: Page) => page.locator('.filter-bar');
const rows = (page: Page) => page.locator('table.movements tbody tr');

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime('2026-01-15T12:00:00');
});

test('a category in the dashboard opens its movements for that month, and back returns', async ({
  page,
}) => {
  await page.goto('/#/dashboard?month=2026-01');
  const categories = page.getByTestId('chart-categories');
  await categories.getByText('Ver los datos').click();
  await categories.getByRole('link', { name: 'Supermercado' }).click();

  await expect(page).toHaveURL(/#\/movements\?month=2026-01&category=\d+/);
  await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
  await expect(filterBar(page)).toContainText('categoría Supermercado');
  await expect(filterBar(page)).toContainText('enero de 2026');
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).first()).toContainText('Compra semanal');

  await filterBar(page).getByRole('link', { name: 'Quitar filtro' }).click();
  await expect(filterBar(page)).toHaveCount(0);
  await expect(rows(page)).toHaveCount(6);

  // Back goes to the filtered view, then to the dashboard.
  await page.goBack();
  await expect(filterBar(page)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
});

test('clicking a bar of the category chart opens that category', async ({ page }) => {
  await page.goto('/#/dashboard?month=2026-01');
  await page.getByTestId('chart-categories').locator('.recharts-bar-rectangle').first().click();
  await expect(page).toHaveURL(/#\/movements\?month=2026-01&category=\d+/);
  await expect(filterBar(page)).toContainText('categoría');
});

test('clicking a month in the months chart opens that month', async ({ page }) => {
  await page.goto('/#/dashboard?month=2026-01');
  await page.getByTestId('chart-months').locator('.recharts-bar-rectangle').last().click();
  await expect(page).toHaveURL(/#\/movements\?month=\d{4}-\d{2}$/);
});

test('a debt in the dashboard opens its detail, and the filter can be cleared', async ({
  page,
}) => {
  await page.goto('/#/dashboard?month=2026-01');
  await page.getByTestId('debt-card').getByRole('link').click();
  await expect(page).toHaveURL(/#\/debts\?debt=\d+/);
  await expect(filterBar(page)).toContainText('deuda Préstamo personal de ejemplo');
  await expect(page.locator('.debt-card')).toHaveCount(1);
  await expect(page.getByText('Cuotas confirmadas')).toBeVisible();
  await expect(page.getByText('Amortizaciones extra vinculadas').first()).toBeVisible();

  await filterBar(page).getByRole('link', { name: 'Ver todas las deudas' }).click();
  await expect(filterBar(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/debts$/);
});

test('the goal, the pending items and the milestones of the dashboard open their screens', async ({
  page,
}) => {
  await page.goto('/#/dashboard?month=2026-01');
  await page.getByTestId('figure-goal').getByRole('link').first().click();
  await expect(page.getByRole('heading', { name: 'Objetivos', level: 1 })).toBeVisible();

  await page.goBack();
  await page.getByTestId('upcoming-pending').getByRole('link', { name: 'Internet' }).click();
  await expect(page).toHaveURL(/#\/movements\?month=2026-01/);
  await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible();

  await page.goBack();
  await page
    .getByTestId('upcoming-milestones')
    .getByRole('link', { name: 'Liquidar el préstamo' })
    .click();
  await expect(page.getByRole('heading', { name: 'Hitos', level: 1 })).toBeVisible();
});

test('a budget row opens the movements of that category and month', async ({ page }) => {
  await page.goto('/#/budget?month=2026-01');
  await page.locator('table.budget').getByRole('link', { name: 'Ocio' }).click();
  await expect(page).toHaveURL(/#\/movements\?month=2026-01&category=\d+/);
  await expect(filterBar(page)).toContainText('categoría Ocio');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Cine');
});

test('a category opens its movements for the selected month', async ({ page }) => {
  await page.goto('/#/categories');
  await page.getByRole('link', { name: 'Vivienda' }).click();
  await expect(filterBar(page)).toContainText('categoría Vivienda');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Alquiler');
});

test('a fixed item opens the movements it confirmed, across months', async ({ page }) => {
  await page.goto('/#/recurring');
  await page.locator('table.recurring').getByRole('link', { name: 'Alquiler' }).click();
  await expect(page).toHaveURL(/#\/movements\?month=\d{4}-\d{2}&fixed=\d+/);
  await expect(filterBar(page)).toContainText('confirmados desde un fijo');
  await expect(page.getByTestId('search-totals')).toContainText('1 movimiento');
  await expect(page.locator('table.movements')).toContainText('Alquiler');

  await filterBar(page).getByRole('link', { name: 'Quitar filtro' }).click();
  await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible();
  await expect(nav(page, 'Movimientos')).toHaveAttribute('aria-current', 'page');
});
