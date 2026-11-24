import { expect, test, type Page } from '@playwright/test';

// Budget screen in production mode, on the seeded temporary database (fresh on every run).
// January 2026 has budget lines for Vivienda (700,00), Supermercado (350,00) and Ocio (100,00).
// Budget lines are append-only by design, so the test cannot clean up after itself: it only
// adds a line for Suministros in 2030, a month no other spec looks at.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });
const monthInput = (page: Page) => page.locator('nav.month-picker input[type=month]');
const row = (page: Page, text: string) =>
  page.locator('table.budget tbody tr').filter({ hasText: text });

test('shows the month with budget, actual and difference, and changes a budget from a month on', async ({
  page,
}) => {
  await page.goto('/');
  await nav(page, 'Presupuesto').click();
  await expect(page.getByRole('heading', { name: 'Presupuesto', level: 1 })).toBeVisible();

  await test.step('January: seeded budget against confirmed spending, with totals', async () => {
    await monthInput(page).fill('2026-01');
    await expect(row(page, 'Vivienda')).toContainText(/700,00\s€/);
    await expect(row(page, 'Supermercado')).toContainText(/350,00\s€/);
    await expect(row(page, 'Supermercado')).toContainText(/176,70\s€/);
    await expect(row(page, 'Supermercado')).toContainText(/173,30\s€/);
    await expect(row(page, 'Suministros')).toContainText('Sin presupuesto');
    const total = page.locator('table.budget tfoot tr');
    await expect(total).toContainText(/1\.150,00\s€/);
    await expect(total).toContainText(/900,70\s€/);
    await expect(total).toContainText(/249,30\s€/);
  });

  await test.step('set a budget from 2030-06: earlier months stay as they were', async () => {
    await row(page, 'Suministros').getByRole('button', { name: 'Fijar' }).click();
    await expect(page.getByLabel('Categoría')).toHaveValue(/\d+/);
    await page.getByLabel('Presupuesto mensual (€)').fill('90,00');
    await page.getByLabel('Desde (mes)').fill('2030-06');
    await page.getByRole('button', { name: 'Guardar presupuesto' }).click();

    await monthInput(page).fill('2030-07');
    await expect(row(page, 'Suministros')).toContainText(/90,00\s€/);
    await expect(row(page, 'Suministros')).toContainText('desde 06/2030');
    await monthInput(page).fill('2030-05');
    await expect(row(page, 'Suministros')).toContainText('Sin presupuesto');
  });

  await test.step('the same month again is refused: history is not edited', async () => {
    await page.getByLabel('Categoría').selectOption({ label: 'Suministros' });
    await page.getByLabel('Presupuesto mensual (€)').fill('10,00');
    await page.getByLabel('Desde (mes)').fill('2030-06');
    await page.getByRole('button', { name: 'Guardar presupuesto' }).click();
    await expect(page.getByText(/El historial no se edita/)).toBeVisible();
  });
});
