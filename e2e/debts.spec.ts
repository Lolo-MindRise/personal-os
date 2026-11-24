import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Debts screen in production mode, on the seeded temporary database. The seed has one debt:
// "Préstamo personal de ejemplo", balance 3.000,00 as of 2026-01-31, 150,00 a month, 20
// installments left, 6,50 %. The test links a repayment (in February 2026, never the current
// month, which other specs expect empty) and removes it afterwards. There is no way to delete a
// debt, so the debt it adds stays; the e2e database is fresh on every run.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });
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
      await expect(seeded).toContainText('Sin cuotas confirmadas desde esa fecha');
      await expect(page.getByText(/no se descuentan automáticamente/)).toHaveCount(0);
    });

    await test.step('add a debt', async () => {
      await page.getByRole('button', { name: 'Añadir deuda' }).click();
      await page.getByLabel('Nombre').fill('tarjeta de prueba'); // lowercase on purpose
      await page.getByLabel('Saldo pendiente (€)').fill('1.200,00');
      await page.getByLabel('Saldo a fecha de').fill('2026-02-01');
      await page.getByLabel('Cuota mensual (€)').fill('50');
      await page.getByLabel('Cuotas restantes').fill('24');
      await page.getByLabel('Interés anual (%)').fill('19,99');
      await page.getByRole('button', { name: 'Guardar deuda' }).click();
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
      await page.getByRole('button', { name: 'Añadir movimiento' }).click();
      await page.getByLabel('Tipo').selectOption({ label: 'Amortización' });
      await page.getByLabel('Categoría').selectOption({ label: 'Amortización extra' });
      await page
        .getByLabel('Deuda (opcional)')
        .selectOption({ label: 'Préstamo personal de ejemplo' });
      await page.getByLabel('Fecha').fill('2026-02-10');
      await page.getByLabel('Concepto').fill('extra de prueba');
      await page.getByLabel('Importe (€)').fill('200');
      await page.getByRole('button', { name: 'Guardar movimiento' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    await test.step('the estimated balance drops by the extra repayment', async () => {
      await nav(page, 'Deudas').click();
      await expect(seeded.locator('.debt-estimate')).toContainText(/2\.800,00\s€/);
      await expect(seeded).toContainText(/Amortizado con extras\s*200,00\s€/);
      await expect(seeded).toContainText('Amortizaciones extra vinculadas (2)');
    });

    await test.step('updating the balance records a new date and restarts the estimate', async () => {
      await seeded.getByRole('button', { name: 'Editar' }).click();
      await page.getByLabel('Saldo pendiente (€)').fill('2.500,00');
      // Editing the balance moves the as-of date to today.
      await expect(page.getByLabel('Saldo a fecha de')).not.toHaveValue('2026-01-31');
      await page.getByLabel('Saldo a fecha de').fill('2026-02-28');
      await page.getByRole('button', { name: 'Guardar deuda' }).click();
      await expect(seeded).toContainText('a fecha 28/02/2026');
      await expect(seeded.locator('.debt-estimate')).toContainText(/2\.500,00\s€/);
      await expect(seeded).toContainText(/Amortizado con extras\s*0,00\s€/);
    });
  } finally {
    await removeFebruaryMovements(request);
  }
});

test('a fixed installment linked to a debt reduces its balance by the principal when confirmed', async ({
  page,
  request,
}) => {
  // A debt of its own: 3.000,00 on 2026-01-31 at 6,50 %, so the first installment of 150,00
  // splits into 16,25 of interest (3.000 × 6,5 % / 12) and 133,75 of principal.
  const created = await request.post('/api/debts', {
    data: {
      name: 'préstamo con cuota',
      monthlyPaymentCents: 15_000,
      balanceCents: 300_000,
      balanceAsOf: '2026-01-31',
      remainingInstallments: 20,
      annualRateBps: 650,
    },
  });
  expect(created.ok()).toBe(true);
  try {
    await page.goto('/');
    await nav(page, 'Fijos').click();
    await test.step('add the fixed installment, linked to the debt', async () => {
      await page.getByRole('button', { name: 'Añadir fijo' }).click();
      await page.getByLabel('Tipo').selectOption({ label: 'Amortización' });
      await page.getByLabel('Categoría').selectOption({ label: 'Amortización extra' });
      await page.getByLabel('Deuda (opcional)').selectOption({ label: 'préstamo con cuota' });
      await page.getByLabel('Concepto').fill('cuota de prueba');
      await page.getByLabel('Importe previsto (€)').fill('150');
      await page.getByLabel('Día del mes').fill('5');
      // Only February 2026: the current month's pending list must stay as other specs expect.
      await page.getByLabel('Desde (mes)').fill('2026-02');
      await page.getByLabel('Hasta (mes, opcional)').fill('2026-02');
      await page.getByRole('button', { name: 'Guardar fijo' }).click();
      await expect(page.getByText('Cuota de la deuda «préstamo con cuota»')).toBeVisible();
    });

    await test.step('the balance does not move before the installment is confirmed', async () => {
      await nav(page, 'Deudas').click();
      const debt = card(page, 'préstamo con cuota');
      await expect(debt.locator('.debt-estimate')).toContainText(/3\.000,00\s€/);
    });

    await test.step('confirming it splits the installment into interest and principal', async () => {
      const items = (await (await request.get('/api/recurring-items')).json()) as {
        id: number;
        concept: string;
      }[];
      const item = items.find((i) => i.concept === 'cuota de prueba');
      expect(item).toBeDefined();
      const confirmed = await request.post(
        `/api/recurring-items/${String(item?.id ?? 0)}/months/2026-02/confirm`,
        { data: {} },
      );
      expect(confirmed.status()).toBe(201);
      await nav(page, 'Inicio').click();
      await nav(page, 'Deudas').click();
      const debt = card(page, 'préstamo con cuota');
      await expect(debt.locator('.debt-estimate')).toContainText(/2\.866,25\s€/);
      await expect(debt.getByTestId('interest-paid')).toContainText(/16,25\s€/);
      await expect(debt).toContainText('Cuotas confirmadas (1)');
    });
  } finally {
    await removeFebruaryMovements(request);
    const items = (await (await request.get('/api/recurring-items')).json()) as {
      id: number;
      concept: string;
    }[];
    for (const item of items.filter((i) => i.concept === 'cuota de prueba')) {
      await request.delete(`/api/recurring-items/${String(item.id)}`);
    }
  }
});
