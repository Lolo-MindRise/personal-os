import { expect, test } from '@playwright/test';

// Quick add (plan 0003, task 07): key N opens the new-movement panel from any screen, and the
// category suggestion is shown but never applied until "Usar" is pressed. The only data the test
// creates is one movement whose concept starts with "zzquick"; it is removed for good at the end.

test('N opens the panel on Informes; the suggestion waits for «Usar»', async ({
  page,
  request,
}) => {
  let movementId: number | undefined;
  try {
    const categories = (await (await request.get('/api/categories')).json()) as {
      id: number;
      name: string;
      kind: string;
    }[];
    const groceries = categories.find((c) => c.name === 'Supermercado' && c.kind === 'expense');
    expect(groceries).toBeDefined();
    const created = await request.post('/api/movements', {
      data: {
        date: '2028-03-05',
        kind: 'expense',
        categoryId: groceries?.id,
        concept: 'zzquick Panadería',
        amountCents: 350,
      },
    });
    expect(created.ok()).toBe(true);
    movementId = ((await created.json()) as { id: number }).id;

    await page.goto('/#/reports');
    await expect(page.getByRole('heading', { name: 'Informes', level: 1 })).toBeVisible();

    await page.keyboard.press('n');
    const panel = page.getByRole('dialog', { name: 'Añadir movimiento' });
    await expect(panel).toBeVisible();

    // Typing an "n" in a field does not open anything else; the suggestion appears on its own.
    await panel.getByLabel('Concepto').fill('ZZQUICK panaderia');
    await expect(panel.getByText('Sugerencia: Supermercado')).toBeVisible();
    // Not applied by itself, not even after leaving the field.
    await panel.getByLabel('Importe').click();
    await expect(panel.getByLabel('Categoría')).toHaveValue('');

    await panel.getByRole('button', { name: 'Usar' }).click();
    await expect(panel.getByLabel('Categoría')).toHaveValue(String(groceries?.id));
    await expect(panel.getByText('Sugerencia:')).toHaveCount(0);

    // Changing the kind drops the suggestion (income has no similar movement) and clears the
    // category; going back to expense offers it again without applying it.
    await panel.getByLabel('Tipo').selectOption('income');
    await expect(panel.getByText('Sugerencia:')).toHaveCount(0);
    await panel.getByLabel('Tipo').selectOption('expense');
    await expect(panel.getByText('Sugerencia: Supermercado')).toBeVisible();
    await expect(panel.getByLabel('Categoría')).toHaveValue('');

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/reports/);

    // With the panel closed and focus on the page, N opens it again; with Ctrl it does not.
    await page.keyboard.press('Control+n');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('N');
    await expect(page.getByRole('dialog', { name: 'Añadir movimiento' })).toBeVisible();
  } finally {
    if (movementId !== undefined) {
      const trashed = await request.delete(`/api/movements/${String(movementId)}`);
      expect(trashed.ok()).toBe(true);
      const gone = await request.delete(`/api/trash/movements/${String(movementId)}`);
      expect(gone.ok()).toBe(true);
    }
  }
});

test('saving from another screen refreshes the list on Movimientos', async ({ page, request }) => {
  try {
    await page.goto('/#/movements?month=2028-04');
    await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
    await page.keyboard.press('n');
    const panel = page.getByRole('dialog', { name: 'Añadir movimiento' });
    await expect(panel).toBeVisible();
    await page.getByLabel('Fecha').fill('2028-04-10');
    await page.getByLabel('Concepto').fill('zzquick Cafe');
    await page.getByLabel('Importe').fill('2,5');
    await page.getByLabel('Categoría').selectOption({ label: 'Ocio' });
    await page.getByRole('button', { name: 'Guardar movimiento' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const row = page.locator('table.movements tbody tr', { hasText: 'zzquick Cafe' });
    await expect(row).toBeVisible();
  } finally {
    const rows = (await (await request.get('/api/movements?month=2028-04')).json()) as {
      id: number;
      concept: string;
    }[];
    for (const { id } of rows.filter((r) => r.concept === 'zzquick Cafe')) {
      const trashed = await request.delete(`/api/movements/${String(id)}`);
      expect(trashed.ok()).toBe(true);
      const gone = await request.delete(`/api/trash/movements/${String(id)}`);
      expect(gone.ok()).toBe(true);
    }
  }
});
