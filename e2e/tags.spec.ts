import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Tags (marcas) in production mode on the seeded temporary database. Everything the test creates is
// dated in 2027-12 and its tags start with "zz", and the test removes it afterwards.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });
const results = (page: Page) => page.getByRole('region', { name: 'Resultados de la búsqueda' });

async function cleanUp(request: APIRequestContext) {
  const rows = (await (await request.get('/api/movements?month=2027-12')).json()) as {
    id: number;
  }[];
  for (const row of rows) {
    await request.delete(`/api/movements/${String(row.id)}`);
  }
  const tags = (await (await request.get('/api/tags')).json()) as { id: number; name: string }[];
  for (const tag of tags.filter((t) => t.name.startsWith('zz'))) {
    await request.delete(`/api/tags/${String(tag.id)}`);
  }
}

test('tag a movement, filter by the tag and keep the filter after a reload', async ({
  page,
  request,
}) => {
  try {
    const categories = (await (await request.get('/api/categories')).json()) as {
      id: number;
      name: string;
    }[];
    const groceries = categories.find((c) => c.name === 'Supermercado')?.id ?? 0;
    expect(groceries).toBeGreaterThan(0);

    await page.goto('/#/movements?month=2027-12');
    await page.getByRole('button', { name: 'Añadir movimiento' }).click();
    await page.getByLabel('Fecha').fill('2027-12-04');
    await page.getByLabel('Concepto').fill('zztags Hotel');
    await page.getByLabel('Importe').fill('30');
    await page.getByLabel('Categoría').selectOption({ label: 'Supermercado' });
    const box = page.getByLabel('Marcas', { exact: true });
    await box.fill('zzviaje');
    await box.press('Enter');
    // Enter adds the tag without saving the movement.
    await expect(page.getByRole('button', { name: 'Quitar la marca zzviaje' })).toBeVisible();
    await box.fill('zzcasa,');
    await expect(page.getByRole('button', { name: 'Quitar la marca zzcasa' })).toBeVisible();
    await page.getByRole('button', { name: 'Guardar movimiento' }).click();

    const row = page.locator('table.movements tbody tr', { hasText: 'zztags Hotel' });
    await expect(row.getByRole('listitem')).toHaveText(['zzcasa', 'zzviaje']);

    // A second movement with only one of the tags.
    const response = await request.post('/api/movements', {
      data: {
        date: '2027-12-05',
        kind: 'expense',
        categoryId: groceries,
        concept: 'zztags Vuelo',
        amountCents: 5_000,
        tags: ['zzviaje'],
      },
    });
    expect(response.status()).toBe(201);
    await page.reload();

    await test.step('filter by one tag, then by both (all must match)', async () => {
      await page.getByRole('button', { name: 'Buscar y filtrar' }).click();
      await page.getByLabel('zzviaje').check();
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByTestId('search-totals')).toContainText('2 movimientos');
      await page.getByLabel('zzcasa').check();
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByTestId('search-totals')).toContainText('1 movimiento');
      await expect(results(page)).toContainText('zztags Hotel');
      await expect(page).toHaveURL(/tag=\d+(%2C|,)\d+/);
    });

    await test.step('the filter survives a reload', async () => {
      await page.reload();
      await expect(page.getByTestId('search-totals')).toContainText('1 movimiento');
      await expect(results(page)).toContainText('zztags Hotel');
      await expect(page.getByLabel('zzviaje')).toBeChecked();
      await expect(page.getByLabel('zzcasa')).toBeChecked();
    });

    await test.step('rename and delete from Marcas; the movements stay', async () => {
      await nav(page, 'Marcas').click();
      await expect(page.getByRole('heading', { name: 'Marcas', level: 1 })).toBeVisible();
      await page.getByRole('button', { name: 'Renombrar la marca zzviaje' }).click();
      await page.getByLabel('Nombre de la marca').fill('zzviajes');
      await page.getByRole('button', { name: 'Guardar marca' }).click();
      await expect(page.getByRole('cell', { name: 'zzviajes', exact: true })).toBeVisible();

      page.once('dialog', (dialog) => void dialog.accept());
      await page.getByRole('button', { name: 'Eliminar la marca zzcasa' }).click();
      await expect(page.getByRole('cell', { name: 'zzcasa', exact: true })).toHaveCount(0);

      await page.goto('/#/movements?month=2027-12');
      const hotel = page.locator('table.movements tbody tr', { hasText: 'zztags Hotel' });
      await expect(hotel.getByRole('listitem')).toHaveText(['zzviajes']);
      await expect(
        page.locator('table.movements tbody tr', { hasText: 'zztags Vuelo' }),
      ).toHaveCount(1);
    });
  } finally {
    await cleanUp(request);
  }
});
