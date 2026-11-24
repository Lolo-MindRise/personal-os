import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Recurring items (ADR-0005) in production mode, on the seeded temporary database.
// The seed defines five fixed items from 2026-01 with no end month: Nómina (income 2.000,00,
// day 1), Alquiler (700,00, day 2), Internet (35,00, day 10), Electricidad (65,00, day 12)
// and Gimnasio (30,00, day 15). In the current month none is confirmed, so all five are
// pending. Each test cleans up after itself, so the database ends as it started.

type MovementRow = { id: number };
type ItemRow = { id: number; concept: string };

/** The current month in the browser's (local) calendar, as the page computes it. */
function localMonth(): string {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const nav = (page: Page, name: 'Movimientos' | 'Fijos') =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name });
const summaryItem = (page: Page, label: string) =>
  page.locator('.summary-item').filter({ hasText: label });
const pendingItem = (page: Page, label: string) =>
  page.locator('.pending-item').filter({ hasText: label });
const pendingRow = (page: Page, text: string) =>
  page.locator('table.pending tbody tr.pending-row:not(.skipped-row)').filter({ hasText: text });
const skippedRow = (page: Page, text: string) =>
  page.locator('table.pending tbody tr.skipped-row').filter({ hasText: text });
const movementRows = (page: Page) => page.locator('table.movements tbody tr');
const itemRows = (page: Page) => page.locator('table.recurring tbody tr');

/** Leaves the current month as it was found: no movements, no skips, no test items. */
async function cleanUp(request: APIRequestContext, month: string, concepts: string[]) {
  const movements = (await (
    await request.get(`/api/movements?month=${month}`)
  ).json()) as MovementRow[];
  for (const movement of movements) {
    await request.delete(`/api/movements/${String(movement.id)}`);
  }
  const items = (await (await request.get('/api/recurring-items')).json()) as ItemRow[];
  for (const item of items) {
    // 404 when there is no skip: fine.
    await request.delete(`/api/recurring-items/${String(item.id)}/months/${month}/skip`);
    if (concepts.includes(item.concept)) {
      await request.delete(`/api/recurring-items/${String(item.id)}`);
    }
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
});

test('define a fixed item, see it pending, confirm it with another amount, skip one, confirm all', async ({
  page,
  request,
}) => {
  const month = localMonth();
  const created = 'suscripción de prueba'; // lowercase on purpose: shown as typed
  try {
    await test.step('Fijos lists the seeded items', async () => {
      await nav(page, 'Fijos').click();
      await expect(page.getByRole('heading', { name: 'Fijos', level: 1 })).toBeVisible();
      await expect(nav(page, 'Fijos')).toHaveAttribute('aria-current', 'page');
      await expect(itemRows(page)).toHaveCount(5);
    });

    await test.step('an invalid day shows its error next to the field and saves nothing', async () => {
      await page.getByLabel('Categoría').selectOption({ label: 'Ocio' });
      await page.getByLabel('Concepto').fill(created);
      await page.getByLabel('Importe previsto (€)').fill('9,99');
      await page.getByLabel('Día del mes').fill('40');
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();

      await expect(page.locator('#recurring-expectedDay-error')).toHaveText(/del 1 al 31/);
      await expect(page.getByLabel('Día del mes')).toHaveAttribute(
        'aria-describedby',
        'recurring-expectedDay-error',
      );
      await expect(itemRows(page)).toHaveCount(5);
    });

    await test.step('add the item', async () => {
      await page.getByLabel('Día del mes').fill('28');
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();

      await expect(itemRows(page)).toHaveCount(6);
      const row = itemRows(page).filter({ hasText: created });
      await expect(row).toContainText(/9,99\s€/);
      await expect(row).toContainText('Sin fin');
      await expect(row.locator('td').nth(2)).toHaveCSS('text-transform', 'none');
    });

    await test.step('it is pending this month, with the pending totals', async () => {
      await nav(page, 'Movimientos').click();
      await expect(page.getByRole('heading', { name: 'Pendientes' })).toBeVisible();
      await expect(page.locator('table.pending tbody tr.pending-row')).toHaveCount(6);
      await expect(pendingRow(page, created)).toContainText(/9,99\s€/);
      await expect(pendingRow(page, created)).toContainText(
        `28/${month.slice(5)}/${month.slice(0, 4)}`,
      );

      // Nothing is confirmed yet: pending = 2.000,00 in, 700 + 65 + 35 + 30 + 9,99 out.
      await expect(summaryItem(page, 'Ahorro')).toContainText(/0,00\s€/);
      await expect(pendingItem(page, 'Ingresos pendientes')).toContainText(/2\.000,00\s€/);
      await expect(pendingItem(page, 'Gastos pendientes')).toContainText(/839,99\s€/);
      await expect(pendingItem(page, 'Ahorro previsto')).toContainText(/1\.160,01\s€/);
      await expect(page.getByText('No hay movimientos este mes.')).toBeVisible();
    });

    await test.step('confirm it with a different amount', async () => {
      await pendingRow(page, created).getByRole('button', { name: 'Confirmar' }).click();

      const form = page.locator('form.movement-form');
      await expect(form.getByRole('heading', { name: 'Confirmar fijo' })).toBeVisible();
      // Pre-filled with the expected values; kind and category come from the item.
      await expect(page.getByLabel('Concepto')).toHaveValue(created);
      await expect(page.getByLabel('Importe (€)')).toHaveValue('9,99');
      await expect(page.getByLabel('Fecha')).toHaveValue(`${month}-28`);
      await expect(page.getByLabel('Tipo')).toBeDisabled();
      await expect(page.getByLabel('Categoría')).toBeDisabled();

      await page.getByLabel('Importe (€)').fill('12,50');
      await form.getByRole('button', { name: 'Confirmar', exact: true }).click();

      await expect(movementRows(page)).toHaveCount(1);
      await expect(movementRows(page).first()).toContainText(created);
      await expect(movementRows(page).first()).toContainText(/12,50\s€/);
      await expect(page.locator('table.pending tbody tr.pending-row')).toHaveCount(5);
      await expect(pendingRow(page, created)).toHaveCount(0);

      await expect(summaryItem(page, 'Gastos')).toContainText(/12,50\s€/);
      await expect(summaryItem(page, 'Ahorro')).toContainText(/-12,50\s€/);
      await expect(pendingItem(page, 'Gastos pendientes')).toContainText(/830,00\s€/);
      // −12,50 confirmed + 2.000,00 pending income − 830,00 pending expenses
      await expect(pendingItem(page, 'Ahorro previsto')).toContainText(/1\.157,50\s€/);
      await expect(form.getByRole('heading', { name: 'Añadir movimiento' })).toBeVisible();
    });

    await test.step('skip one, undo it, skip it again', async () => {
      await pendingRow(page, 'Gimnasio').getByRole('button', { name: 'Saltar' }).click();
      await expect(pendingRow(page, 'Gimnasio')).toHaveCount(0);
      await expect(skippedRow(page, 'Gimnasio')).toContainText('Saltado este mes');
      await expect(pendingItem(page, 'Gastos pendientes')).toContainText(/800,00\s€/);

      await skippedRow(page, 'Gimnasio').getByRole('button', { name: 'Deshacer' }).click();
      await expect(skippedRow(page, 'Gimnasio')).toHaveCount(0);
      await expect(pendingRow(page, 'Gimnasio')).toHaveCount(1);
      await expect(pendingItem(page, 'Gastos pendientes')).toContainText(/830,00\s€/);

      await pendingRow(page, 'Gimnasio').getByRole('button', { name: 'Saltar' }).click();
      await expect(skippedRow(page, 'Gimnasio')).toHaveCount(1);
    });

    await test.step('confirm all: every pending entry, but not the skipped one', async () => {
      await page.getByRole('button', { name: 'Confirmar todos' }).click();

      await expect(movementRows(page)).toHaveCount(5);
      for (const concept of ['Nómina', 'Alquiler', 'Electricidad', 'Internet', created]) {
        await expect(movementRows(page).filter({ hasText: concept })).toHaveCount(1);
      }
      await expect(
        page.locator('table.pending tbody tr.pending-row:not(.skipped-row)'),
      ).toHaveCount(0);
      await expect(skippedRow(page, 'Gimnasio')).toHaveCount(1);
      await expect(page.getByRole('button', { name: 'Confirmar todos' })).toBeDisabled();

      // 2.000,00 in; 12,50 + 700 + 65 + 35 out. The skipped item counts nowhere.
      await expect(summaryItem(page, 'Ingresos')).toContainText(/2\.000,00\s€/);
      await expect(summaryItem(page, 'Gastos')).toContainText(/812,50\s€/);
      await expect(summaryItem(page, 'Ahorro')).toContainText(/1\.187,50\s€/);
      await expect(pendingItem(page, 'Gastos pendientes')).toContainText(/0,00\s€/);
      await expect(pendingItem(page, 'Ahorro previsto')).toContainText(/1\.187,50\s€/);
    });

    await test.step('deleting a confirmed movement makes its item pending again', async () => {
      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await movementRows(page)
        .filter({ hasText: 'Internet' })
        .getByRole('button', { name: 'Eliminar' })
        .click();

      await expect(movementRows(page)).toHaveCount(4);
      await expect(pendingRow(page, 'Internet')).toHaveCount(1);
      await expect(pendingItem(page, 'Gastos pendientes')).toContainText(/35,00\s€/);
    });
  } finally {
    await cleanUp(request, month, [created]);
  }
});

test('edit a fixed item, end it, and see it stop appearing as pending', async ({
  page,
  request,
}) => {
  const month = localMonth();
  const concept = 'Curso corto';
  const mm = month.slice(5);
  const yyyy = month.slice(0, 4);
  try {
    await nav(page, 'Fijos').click();
    await page.getByLabel('Categoría').selectOption({ label: 'Ocio' });
    await page.getByLabel('Concepto').fill(concept);
    await page.getByLabel('Importe previsto (€)').fill('20');
    await page.getByLabel('Día del mes').fill('3');
    await page.getByRole('button', { name: 'Añadir', exact: true }).click();
    await expect(itemRows(page)).toHaveCount(6);

    await test.step('edit it', async () => {
      await itemRows(page)
        .filter({ hasText: concept })
        .getByRole('button', { name: 'Editar' })
        .click();
      await expect(page.getByRole('heading', { name: 'Editar fijo' })).toBeVisible();
      await expect(page.getByLabel('Importe previsto (€)')).toHaveValue('20,00');

      await page.getByLabel('Importe previsto (€)').fill('25');
      await page.getByRole('button', { name: 'Guardar cambios' }).click();

      await expect(page.getByRole('heading', { name: 'Añadir fijo' })).toBeVisible();
      await expect(itemRows(page).filter({ hasText: concept })).toContainText(/25,00\s€/);
    });

    await test.step('an end month before the start month is rejected next to the field', async () => {
      await itemRows(page)
        .filter({ hasText: concept })
        .getByRole('button', { name: 'Editar' })
        .click();
      await page.getByLabel('Hasta (mes, opcional)').fill(`${String(Number(yyyy) - 1)}-12`);
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(page.locator('#recurring-endMonth-error')).toHaveText(/anterior al mes inicial/);
      await page.getByRole('button', { name: 'Cancelar' }).click();
    });

    await test.step('end it: it stays pending this month, and not from next month', async () => {
      page.once('dialog', (dialog) => {
        void dialog.accept();
      });
      await itemRows(page)
        .filter({ hasText: concept })
        .getByRole('button', { name: 'Terminar' })
        .click();

      const row = itemRows(page).filter({ hasText: concept });
      await expect(row).toContainText(`${mm}/${yyyy}`);
      await expect(row.getByRole('button', { name: 'Terminar' })).toHaveCount(0);
      await expect(row.getByRole('button', { name: 'Editar' })).toHaveCount(1);

      await nav(page, 'Movimientos').click();
      await expect(pendingRow(page, concept)).toContainText(/25,00\s€/);

      await page.getByRole('button', { name: 'Mes siguiente' }).click();
      await expect(page.locator('table.pending tbody tr.pending-row')).toHaveCount(5);
      await expect(pendingRow(page, concept)).toHaveCount(0);
    });
  } finally {
    await cleanUp(request, month, [concept]);
  }
});

test('a failed action keeps its error visible, and confirm all cancels a confirmation in progress', async ({
  page,
  request,
}) => {
  const month = localMonth();
  try {
    await test.step('an entry confirmed elsewhere: skipping the stale row explains why it failed', async () => {
      await expect(pendingRow(page, 'Internet')).toHaveCount(1);
      // Confirm it behind the page's back, so the row on screen is out of date.
      const items = (await (await request.get('/api/recurring-items')).json()) as ItemRow[];
      const internet = items.find((item) => item.concept === 'Internet');
      expect(internet).toBeDefined();
      const confirmed = await request.post(
        `/api/recurring-items/${String(internet?.id)}/months/${month}/confirm`,
      );
      expect(confirmed.status()).toBe(201);

      await pendingRow(page, 'Internet').getByRole('button', { name: 'Saltar' }).click();

      // The list refreshes (the row is gone) and the error is still there afterwards.
      await expect(pendingRow(page, 'Internet')).toHaveCount(0);
      await expect(page.getByRole('alert').filter({ hasText: 'ya está confirmado' })).toBeVisible();
    });

    await test.step('confirm all while confirming one cancels that confirmation, with a message', async () => {
      await pendingRow(page, 'Gimnasio').getByRole('button', { name: 'Confirmar' }).click();
      await expect(page.getByRole('heading', { name: 'Confirmar fijo' })).toBeVisible();

      await page.getByRole('button', { name: 'Confirmar todos' }).click();

      await expect(movementRows(page)).toHaveCount(5);
      await expect(page.getByRole('heading', { name: 'Añadir movimiento' })).toBeVisible();
      await expect(
        page.getByRole('alert').filter({ hasText: 'Se ha cancelado la confirmación' }),
      ).toBeVisible();
      await expect(page.getByLabel('Concepto')).toHaveValue('');
    });
  } finally {
    await cleanUp(request, month, []);
  }
});
