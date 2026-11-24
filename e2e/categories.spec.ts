import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Categories screen in production mode, on the seeded temporary database.
// Tests clean up the categories they create.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });

async function deleteByName(request: APIRequestContext, names: string[]) {
  const all = (await (await request.get('/api/categories')).json()) as {
    id: number;
    name: string;
  }[];
  for (const category of all.filter((c) => names.includes(c.name))) {
    await request.delete(`/api/categories/${String(category.id)}`);
  }
}

test('add, rename and delete a category; a used one cannot be deleted', async ({
  page,
  request,
}) => {
  const created = 'mascotas de prueba'; // lowercase on purpose: shown as typed
  const renamed = 'animales de prueba';
  try {
    await page.goto('/');
    await nav(page, 'Categorías').click();
    await expect(page.getByRole('heading', { name: 'Categorías', level: 1 })).toBeVisible();

    await test.step('a used category explains why it cannot be deleted', async () => {
      const row = page.locator('table.categories tbody tr').filter({ hasText: 'Supermercado' });
      await expect(row).toContainText('En uso');
      await expect(row.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    });

    await test.step('add', async () => {
      await page.getByLabel('Nombre').fill(created);
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();
      await expect(
        page.locator('table.categories tbody tr').filter({ hasText: created }),
      ).toHaveCount(1);
    });

    await test.step('a duplicate name is refused', async () => {
      await page.getByLabel('Nombre').fill('MASCOTAS DE PRUEBA');
      await page.getByRole('button', { name: 'Añadir', exact: true }).click();
      await expect(page.getByText('Ya existe una categoría con ese nombre.')).toBeVisible();
      await page.getByLabel('Nombre').fill('');
    });

    await test.step('rename', async () => {
      const row = page.locator('table.categories tbody tr').filter({ hasText: created });
      await row.getByRole('button', { name: 'Renombrar' }).click();
      await page.getByLabel('Nombre').fill(renamed);
      await page.getByRole('button', { name: 'Guardar cambios' }).click();
      await expect(
        page.locator('table.categories tbody tr').filter({ hasText: renamed }),
      ).toHaveCount(1);
      await expect(page.getByText(created)).toHaveCount(0);
    });

    await test.step('delete', async () => {
      page.once('dialog', (dialog) => void dialog.accept());
      const row = page.locator('table.categories tbody tr').filter({ hasText: renamed });
      await row.getByRole('button', { name: 'Eliminar' }).click();
      await expect(page.getByText(renamed)).toHaveCount(0);
    });
  } finally {
    await deleteByName(request, [created, renamed]);
  }
});
