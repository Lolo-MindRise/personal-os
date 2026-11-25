import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Trash and «Deshacer» (plan 0003, task 03) in production mode on the seeded temporary database.
// Everything the test creates is dated in 2028-02 and its concept starts with "zztrash"; the test
// removes it for good afterwards (deleting only moves to the trash).

const MONTH = '2028-02';
const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });
const summaryItem = (page: Page, label: string) =>
  page.locator('.summary-item').filter({ hasText: label });
const movementRow = (page: Page) =>
  page.locator('table.movements tbody tr', { hasText: 'zztrash Cine' });
const trashRow = (page: Page) => page.getByTestId('trash-row').filter({ hasText: 'zztrash Cine' });

/** The figures of the Inicio key-figures card (accumulated savings, projected savings). */
async function dashboardFigures(page: Page) {
  return {
    accumulated: await page.getByTestId('figure-accumulated').innerText(),
    projected: await page.getByTestId('figure-projected').innerText(),
  };
}

async function cleanUp(request: APIRequestContext) {
  const rows = (await (await request.get(`/api/movements?month=${MONTH}`)).json()) as {
    id: number;
  }[];
  for (const row of rows) {
    await request.delete(`/api/movements/${String(row.id)}`);
  }
  const trash = (await (await request.get('/api/trash')).json()) as {
    movements: { id: number; concept: string }[];
  };
  for (const row of trash.movements.filter((m) => m.concept.startsWith('zztrash'))) {
    await request.delete(`/api/trash/movements/${String(row.id)}`);
  }
}

test('delete, undo within 10 seconds, delete again, restore from the papelera, delete for good', async ({
  page,
  request,
}) => {
  try {
    // The clock is installed before anything loads and paused once the page is up: the 10 seconds
    // of «Deshacer» only pass when the test moves the clock, so a slow run cannot expire the
    // first undo.
    await page.clock.install({ time: new Date('2028-02-15T12:00:00') });

    // Inicio for the month before anything exists: the figures to compare against later.
    await page.goto(`/#/dashboard?month=${MONTH}`);
    await expect(page.getByTestId('figure-projected')).toBeVisible();
    const baseline = await dashboardFigures(page);

    await page.goto(`/#/movements?month=${MONTH}`);
    await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();

    await test.step('add a movement', async () => {
      await page.getByRole('button', { name: 'Añadir movimiento' }).click();
      await page.getByLabel('Fecha').fill(`${MONTH}-10`);
      await page.getByLabel('Concepto').fill('zztrash Cine');
      await page.getByLabel('Importe').fill('24');
      await page.getByLabel('Categoría').selectOption({ label: 'Ocio' });
      await page.getByRole('button', { name: 'Guardar movimiento' }).click();
      await expect(movementRow(page)).toBeVisible();
      await expect(summaryItem(page, 'Gastos')).toContainText(/24,00\s€/);
    });

    await test.step('deleting asks nothing, shows Deshacer, and undo brings it back', async () => {
      await page.clock.pauseAt(new Date('2028-02-15T12:00:30'));
      await movementRow(page).getByRole('button', { name: 'Eliminar' }).click();
      await expect(movementRow(page)).toHaveCount(0);
      await expect(summaryItem(page, 'Gastos')).toContainText(/0,00\s€/);
      const undo = page.getByRole('status').getByRole('button', { name: 'Deshacer' });
      await expect(undo).toBeVisible();
      await expect(undo).toBeFocused();
      await undo.click();
      await expect(movementRow(page)).toBeVisible();
      await expect(summaryItem(page, 'Gastos')).toContainText(/24,00\s€/);
      await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
    });

    await test.step('after 10 seconds the toast goes and the movement is in Papelera', async () => {
      await movementRow(page).getByRole('button', { name: 'Eliminar' }).click();
      await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible();
      await page.clock.fastForward(10_500);
      await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
      await expect(movementRow(page)).toHaveCount(0);
      await expect(summaryItem(page, 'Gastos')).toContainText(/0,00\s€/);

      // Time flows again: loading another screen needs the page's own timers.
      await page.clock.resume();
      await nav(page, 'Papelera').click();
      await expect(page.getByRole('heading', { name: 'Papelera', level: 1 })).toBeVisible();
      await expect(nav(page, 'Papelera')).toHaveAttribute('aria-current', 'page');
      await expect(trashRow(page)).toContainText('Eliminado el');
    });

    await test.step('Inicio and Movimientos totals do not include it', async () => {
      await page.goto(`/#/movements?month=${MONTH}`);
      await expect(summaryItem(page, 'Gastos')).toContainText(/0,00\s€/);
      // Inicio, same month: the figures are those of the month without the movement.
      await page.goto(`/#/dashboard?month=${MONTH}`);
      await expect(page.getByTestId('figure-projected')).toBeVisible();
      expect(await dashboardFigures(page)).toEqual(baseline);
    });

    await test.step('restore brings it back', async () => {
      await nav(page, 'Papelera').click();
      await trashRow(page).getByRole('button', { name: 'Restaurar' }).click();
      await expect(trashRow(page)).toHaveCount(0);
      await page.goto(`/#/movements?month=${MONTH}`);
      await expect(movementRow(page)).toBeVisible();
      await expect(summaryItem(page, 'Gastos')).toContainText(/24,00\s€/);
    });

    await test.step('permanent delete asks for confirmation that says it cannot be undone', async () => {
      await movementRow(page).getByRole('button', { name: 'Eliminar' }).click();
      await expect(movementRow(page)).toHaveCount(0);
      await nav(page, 'Papelera').click();
      const messages: string[] = [];
      page.once('dialog', (dialog) => {
        messages.push(dialog.message());
        void dialog.dismiss();
      });
      await trashRow(page).getByRole('button', { name: 'Eliminar definitivamente' }).click();
      await expect.poll(() => messages.length).toBe(1);
      expect(messages[0]).toContain('No se puede deshacer');
      await expect(trashRow(page)).toHaveCount(1);

      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await trashRow(page).getByRole('button', { name: 'Eliminar definitivamente' }).click();
      await expect(trashRow(page)).toHaveCount(0);
    });
  } finally {
    await cleanUp(request);
  }
});
