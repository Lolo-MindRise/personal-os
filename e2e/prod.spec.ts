import { expect, test, type Page } from '@playwright/test';

// Production mode: `npm run build` + `npm start` on a clean temporary database
// with the fictional seed (see e2e/prod-server.ts). Tests share that database
// and leave it as they found it.

const summaryItem = (page: Page, label: string) =>
  page.locator('.summary-item').filter({ hasText: label });
const rows = (page: Page) => page.locator('table.movements tbody tr');

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
});

test('shows the seeded month with its totals', async ({ page }) => {
  await page.locator('input[type=month]').fill('2026-01');

  await expect(rows(page)).toHaveCount(6);
  await expect(summaryItem(page, 'Ingresos')).toContainText(/2\.000,00\s€/);
  await expect(summaryItem(page, 'Gastos')).toContainText(/900,70\s€/);
  await expect(summaryItem(page, 'Amortizaciones')).toContainText(/100,00\s€/);
  await expect(summaryItem(page, 'Ahorro')).toContainText(/999,30\s€/);
});

test('the month label is lowercase Spanish, not "Noviembre De 2026"', async ({ page }) => {
  await page.locator('input[type=month]').fill('2026-01');
  await expect(page.locator('.month-label')).toHaveText('enero de 2026');
  await expect(page.locator('.month-label')).toHaveCSS('text-transform', 'none');
});

test('add, edit and delete a movement, with the totals following', async ({ page }) => {
  await expect(page.getByText('No hay movimientos este mes.')).toBeVisible();

  await test.step('add an expense', async () => {
    await page.getByLabel('Categoría').selectOption({ label: 'Supermercado' });
    // Typed in lowercase on purpose: it must be shown exactly as typed.
    await page.getByLabel('Concepto').fill('compra de prueba');
    await page.getByLabel('Importe (€)').fill('12,50');
    await page.getByLabel('Notas').fill('nota en minúsculas');
    await page.getByRole('button', { name: 'Añadir', exact: true }).click();

    await expect(rows(page)).toHaveCount(1);
    const row = rows(page).first();
    await expect(row).toContainText('Gasto');
    await expect(row).toContainText('Supermercado');
    await expect(row).toContainText(/12,50\s€/);
    await expect(row.locator('td').nth(3)).toContainText('compra de prueba');
    await expect(row.locator('td').nth(3)).toContainText('nota en minúsculas');
    await expect(row.locator('td').nth(3)).toHaveCSS('text-transform', 'none');
    await expect(row.locator('.notes')).toHaveCSS('text-transform', 'none');

    await expect(summaryItem(page, 'Gastos')).toContainText(/12,50\s€/);
    await expect(summaryItem(page, 'Ahorro')).toContainText(/-12,50\s€/);
    // The form is cleared for the next movement.
    await expect(page.getByLabel('Concepto')).toHaveValue('');
  });

  await test.step('edit it', async () => {
    await rows(page).first().getByRole('button', { name: 'Editar' }).click();
    await expect(page.getByRole('heading', { name: 'Editar movimiento' })).toBeVisible();
    await expect(page.getByLabel('Importe (€)')).toHaveValue('12,50');

    await page.getByLabel('Concepto').fill('compra editada');
    await page.getByLabel('Importe (€)').fill('1.234,56');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).first()).toContainText('compra editada');
    await expect(rows(page).first()).toContainText(/1\.234,56\s€/);
    await expect(summaryItem(page, 'Gastos')).toContainText(/1\.234,56\s€/);
    await expect(page.getByRole('heading', { name: 'Añadir movimiento' })).toBeVisible();
  });

  await test.step('delete it, accepting the confirmation', async () => {
    // Accept first, assert afterwards: a failing assert inside the handler would
    // leave the dialog open and the test would only time out.
    let confirmation = '';
    page.once('dialog', (dialog) => {
      confirmation = dialog.message();
      void dialog.accept();
    });
    await rows(page).first().getByRole('button', { name: 'Eliminar' }).click();

    await expect(page.getByText('No hay movimientos este mes.')).toBeVisible();
    expect(confirmation).toContain('compra editada');
    await expect(summaryItem(page, 'Gastos')).toContainText(/0,00\s€/);
    await expect(summaryItem(page, 'Ahorro')).toContainText(/0,00\s€/);
  });
});

test('declining the delete confirmation keeps the movement', async ({ page }) => {
  await page.locator('input[type=month]').fill('2026-01');
  await expect(rows(page)).toHaveCount(6);

  page.once('dialog', (dialog) => {
    void dialog.dismiss();
  });
  await rows(page).first().getByRole('button', { name: 'Eliminar' }).click();

  await expect(rows(page)).toHaveCount(6);
});

test('an invalid amount shows its error next to the field and saves nothing', async ({ page }) => {
  await page.getByLabel('Categoría').selectOption({ label: 'Supermercado' });
  await page.getByLabel('Concepto').fill('importe malo');
  await page.getByLabel('Importe (€)').fill('abc');
  await page.getByRole('button', { name: 'Añadir', exact: true }).click();

  const error = page.locator('#movement-amount-error');
  await expect(error).toHaveText(/Importe no válido/);
  // The message sits in the same field block as the input and is linked to it.
  const field = page.locator('.field').filter({ has: page.getByLabel('Importe (€)') });
  await expect(field).toContainText('Importe no válido');
  await expect(page.getByLabel('Importe (€)')).toHaveAttribute(
    'aria-describedby',
    'movement-amount-error',
  );
  await expect(page.getByText('No hay movimientos este mes.')).toBeVisible();

  // Typing again clears the error.
  await page.getByLabel('Importe (€)').fill('3');
  await expect(error).toHaveCount(0);
});
