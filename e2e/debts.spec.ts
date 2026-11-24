import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Debts screen in production mode, on the seeded temporary database. The seed has one debt:
// "Préstamo personal de ejemplo", balance 3.000,00 as of 2026-01-31, 150,00 a month, 20
// installments left, 6,50 %. The test links a repayment (in February 2026, never the current
// month, which other specs expect empty) and removes it afterwards. There is no way to delete a
// debt, so the debt it adds stays; the e2e database is fresh on every run.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name });
const card = (page: Page, name: string) =>
  page.locator('section.debt-card').filter({ hasText: name });

async function removeFebruaryMovements(request: APIRequestContext) {
  const rows = (await (await request.get('/api/movements?month=2026-02')).json()) as {
    id: number;
  }[];
  for (const row of rows) {
    await request.delete(`/api/movements/${String(row.id)}`);
  }
}

test('add a debt, link a repayment from the movement form, and update the balance', async ({
  page,
  request,
}) => {
  try {
    await page.goto('/');
    await nav(page, 'Deudas').click();
    await expect(page.getByRole('heading', { name: 'Deudas', level: 1 })).toBeVisible();

    const seeded = card(page, 'Préstamo personal de ejemplo');
    await test.step('the seeded debt, with its figures', async () => {
      await expect(seeded).toContainText(/3\.000,00\s€/);
      await expect(seeded).toContainText('a fecha 31/01/2026');
      await expect(seeded).toContainText(/150,00\s€/);
      await expect(seeded).toContainText('6,50');
      await expect(page.getByText(/no se descuentan automáticamente/)).toBeVisible();
    });

    await test.step('add a debt', async () => {
      await page.getByLabel('Nombre').fill('tarjeta de prueba'); // lowercase on purpose
      await page.getByLabel('Saldo pendiente (€)').fill('1.200,00');
      await page.getByLabel('Saldo a fecha de').fill('2026-02-01');
      await page.getByLabel('Cuota mensual (€)').fill('50');
      await page.getByLabel('Cuotas restantes').fill('24');
      await page.getByLabel('Interés anual (%)').fill('19,99');
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();
      const added = card(page, 'tarjeta de prueba');
      await expect(added).toContainText(/1\.200,00\s€/);
      await expect(added).toContainText('19,99');
      await expect(added.getByRole('heading', { name: 'tarjeta de prueba' })).toHaveCSS(
        'text-transform',
        'none',
      );
    });

    await test.step('link a repayment to the seeded debt in the movement form', async () => {
      await nav(page, 'Movimientos').click();
      await page.getByLabel('Tipo').selectOption({ label: 'Amortización' });
      await page.getByLabel('Categoría').selectOption({ label: 'Amortización extra' });
      await page
        .getByLabel('Deuda (opcional)')
        .selectOption({ label: 'Préstamo personal de ejemplo' });
      await page.getByLabel('Fecha').fill('2026-02-10');
      await page.getByLabel('Concepto').fill('extra de prueba');
      await page.getByLabel('Importe (€)').fill('200');
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();
      await expect(page.getByLabel('Concepto')).toHaveValue('');
    });

    await test.step('the estimated balance drops by the extra repayment', async () => {
      await nav(page, 'Deudas').click();
      await expect(seeded.locator('.debt-estimate')).toContainText(/2\.800,00\s€/);
      await expect(seeded).toContainText(/Amortizado desde esa fecha\s*200,00\s€/);
      await expect(seeded).toContainText('Amortizaciones extra vinculadas (2)');
    });

    await test.step('updating the balance records a new date and restarts the estimate', async () => {
      await seeded.getByRole('button', { name: 'Editar' }).click();
      await page.getByLabel('Saldo pendiente (€)').fill('2.500,00');
      // Editing the balance moves the as-of date to today.
      await expect(page.getByLabel('Saldo a fecha de')).not.toHaveValue('2026-01-31');
      await page.getByLabel('Saldo a fecha de').fill('2026-02-28');
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(seeded).toContainText('a fecha 28/02/2026');
      await expect(seeded.locator('.debt-estimate')).toContainText(/2\.500,00\s€/);
      await expect(seeded).toContainText(/Amortizado desde esa fecha\s*0,00\s€/);
    });
  } finally {
    await removeFebruaryMovements(request);
  }
});
