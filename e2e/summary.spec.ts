import { expect, test, type Page } from '@playwright/test';

// Resumen and Objetivos in production mode, on the seeded temporary database (fresh per run).
// January 2026: income 2.000,00, expenses 900,70, repayments 100,00, savings 999,30. The seed has
// one goal, "Fondo de emergencia", 6.000,00 by 2026-12-31. The test saves an initial savings
// balance and adds a goal; neither can be removed, and no other spec reads them.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name });
const monthRow = (page: Page, month: string) =>
  page
    .locator('table.summary-year tbody tr')
    .filter({ has: page.getByRole('rowheader', { name: month, exact: true }) });
const goalCard = (page: Page, name: string) =>
  page.locator('section.debt-card').filter({ hasText: name });

test('the yearly summary accumulates savings from the initial balance', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'Resumen').click();
  await expect(page.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible();

  await test.step('go to 2026, the year of the seed', async () => {
    const back = new Date().getFullYear() - 2026;
    for (let i = 0; i < back; i++) {
      await page.getByRole('button', { name: 'Año anterior' }).click();
    }
    await expect(page.locator('.year-label')).toHaveText('2026');
    await expect(page.locator('table.summary-year tbody tr')).toHaveCount(12);
  });

  await test.step('January: totals by kind, savings, and accumulated without an initial balance', async () => {
    const january = monthRow(page, 'enero');
    await expect(january).toContainText(/2\.000,00\s€/);
    await expect(january).toContainText(/900,70\s€/);
    await expect(january).toContainText(/100,00\s€/);
    await expect(january.locator('td').nth(3)).toContainText(/999,30\s€/);
    await expect(january.locator('td').nth(4)).toContainText(/999,30\s€/);
    await expect(page.locator('.bar-track').first()).toBeVisible();
  });

  await test.step('save an initial balance: January accumulates from it', async () => {
    await page.getByLabel('Saldo inicial (€)').fill('5.000,00');
    await page.getByLabel('Saldo a fecha de').fill('2026-01-31');
    await page.getByRole('button', { name: 'Guardar saldo inicial' }).click();
    await expect(page.getByText('Guardado.')).toBeVisible();
    await expect(monthRow(page, 'enero').locator('td').nth(4)).toContainText(/5\.000,00\s€/);
    // The month's own savings do not change.
    await expect(monthRow(page, 'enero').locator('td').nth(3)).toContainText(/999,30\s€/);
  });

  await test.step('an invalid balance is refused next to the field', async () => {
    await page.getByLabel('Saldo inicial (€)').fill('mucho');
    await page.getByRole('button', { name: 'Guardar saldo inicial' }).click();
    await expect(page.getByText(/Importe no válido/)).toBeVisible();
  });
});

test('goals: the seeded one, add one, and edit it', async ({ page, request }) => {
  // Independent of the test above: it sets the initial balance itself.
  const saved = await request.put('/api/settings', {
    data: { initialSavingsCents: 500_000, initialSavingsDate: '2026-01-31' },
  });
  expect(saved.status()).toBe(200);
  await page.goto('/');
  await nav(page, 'Objetivos').click();
  await expect(page.getByRole('heading', { name: 'Objetivos', level: 1 })).toBeVisible();

  await test.step('the seeded goal', async () => {
    const seeded = goalCard(page, 'Fondo de emergencia');
    await expect(seeded).toContainText(/6\.000,00\s€/);
    await expect(seeded).toContainText('31/12/2026');
    await expect(seeded.getByRole('progressbar')).toBeVisible();
  });

  await test.step('add a goal: progress against the initial balance saved in Resumen', async () => {
    await page.getByLabel('Nombre').fill('viaje de prueba'); // lowercase on purpose
    await page.getByLabel('Importe objetivo (€)').fill('10.000,00');
    await page.getByLabel('Fecha objetivo').fill('2099-12-31');
    await page.getByRole('button', { name: 'Añadir', exact: true }).click();
    const added = goalCard(page, 'viaje de prueba');
    await expect(added).toContainText(/5\.000,00\s€ de\s*10\.000,00\s€/);
    await expect(added).toContainText('50 %');
    await expect(added).toContainText(/Falta\s*5\.000,00\s€/);
    await expect(added).toContainText('Ahorro mensual necesario');
    await expect(added).toContainText(/en \d+ meses/);
    await expect(added.getByRole('heading', { name: 'viaje de prueba' })).toHaveCSS(
      'text-transform',
      'none',
    );
  });

  await test.step('edit it: a reached goal needs no monthly saving', async () => {
    await goalCard(page, 'viaje de prueba').getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Importe objetivo (€)').fill('4.000,00');
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    const edited = goalCard(page, 'viaje de prueba');
    await expect(edited).toContainText('Objetivo conseguido.');
    await expect(edited).toContainText('100 %');
  });
});
