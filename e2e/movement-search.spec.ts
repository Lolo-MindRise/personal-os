import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Searching movements across months, in production mode on the seeded temporary database.
// Everything the test creates is dated in 2027-08…2027-10 and carries "zzbusca" in its concept,
// so it never mixes with the seed; the test removes it afterwards.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });
const results = (page: Page) => page.getByRole('region', { name: 'Resultados de la búsqueda' });
const resultRows = (page: Page) => results(page).locator('tbody tr');

async function category(request: APIRequestContext, name: string): Promise<number> {
  const all = (await (await request.get('/api/categories')).json()) as {
    id: number;
    name: string;
  }[];
  const found = all.find((c) => c.name === name);
  expect(found, name).toBeDefined();
  return found?.id ?? 0;
}

async function cleanUp(request: APIRequestContext) {
  for (const month of ['2027-08', '2027-09', '2027-10']) {
    const rows = (await (await request.get(`/api/movements?month=${month}`)).json()) as {
      id: number;
    }[];
    for (const row of rows) {
      await request.delete(`/api/movements/${String(row.id)}`);
    }
  }
}

test('filter movements across months, page through the results and jump to a month', async ({
  page,
  request,
}) => {
  try {
    const groceries = await category(request, 'Supermercado');
    const salary = await category(request, 'Nómina ficticia');
    const add = async (data: Record<string, unknown>) => {
      const response = await request.post('/api/movements', { data });
      expect(response.status()).toBe(201);
    };
    await add({
      date: '2027-09-12',
      kind: 'income',
      categoryId: salary,
      concept: 'zzbusca Nómina de septiembre',
      amountCents: 150_000,
      notes: 'Empresa de ejemplo',
    });
    await add({
      date: '2027-10-03',
      kind: 'expense',
      categoryId: groceries,
      concept: 'zzbusca Compra Mercadona',
      amountCents: 4_550,
    });
    // 55 small expenses in August: more than one page of 50.
    for (let i = 1; i <= 55; i++) {
      await add({
        date: '2027-08-10',
        kind: 'expense',
        categoryId: groceries,
        concept: `zzbusca pan ${String(i).padStart(2, '0')}`,
        amountCents: 100,
      });
    }

    await page.goto('/');
    await nav(page, 'Movimientos').click();
    await page.getByRole('button', { name: 'Buscar y filtrar' }).click();

    await test.step('text search spans months and totals the whole filtered set', async () => {
      await page.getByLabel('Texto en concepto o notas').fill('ZZBUSCA');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByTestId('search-totals')).toContainText('57 movimientos');
      await expect(page.getByTestId('search-totals')).toContainText(/Ingresos 1\.500,00\s€/);
      await expect(page.getByTestId('search-totals')).toContainText(/Gastos 100,50\s€/); // 55 × 1,00 + 45,50
      await expect(page.getByTestId('search-totals')).toContainText(/Balance 1\.399,50\s€/);
      // The monthly view is hidden while searching.
      await expect(page.getByRole('navigation', { name: 'Mes' })).toHaveCount(0);
    });

    await test.step('results are paged: 50 on the first page, the rest on the second', async () => {
      await expect(resultRows(page)).toHaveCount(50);
      await expect(results(page)).toContainText('Página 1 de 2');
      await results(page).getByRole('button', { name: 'Siguiente' }).click();
      await expect(results(page)).toContainText('Página 2 de 2');
      await expect(resultRows(page)).toHaveCount(7);
      // The totals still describe the whole set.
      await expect(page.getByTestId('search-totals')).toContainText('57 movimientos');
      await results(page).getByRole('button', { name: 'Anterior' }).click();
      await expect(results(page)).toContainText('Página 1 de 2');
    });

    await test.step('kind, category, dates and amounts narrow the set', async () => {
      await page.getByLabel('Tipo').selectOption({ label: 'Ingreso' });
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByTestId('search-totals')).toContainText('1 movimiento');
      await expect(resultRows(page)).toContainText('Nómina de septiembre');

      await page.getByLabel('Tipo').selectOption({ label: 'Todos' });
      await page.getByLabel('Categoría', { exact: true }).selectOption({ label: 'Supermercado' });
      await page.getByLabel('Desde (fecha)').fill('2027-10-01');
      await page.getByLabel('Hasta (fecha)').fill('2027-10-31');
      await page.getByLabel('Importe mínimo (€)').fill('45');
      await page.getByLabel('Importe máximo (€)').fill('46');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByTestId('search-totals')).toContainText('1 movimiento');
      await expect(resultRows(page)).toContainText('Compra Mercadona');
    });

    await test.step('the text also searches notes, ignoring accents', async () => {
      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      await page.getByLabel('Texto en concepto o notas').fill('empresa de ejemplo');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(resultRows(page)).toContainText('Nómina de septiembre');
      await page.getByLabel('Texto en concepto o notas').fill('nomina de septiembre');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByTestId('search-totals')).toContainText('1 movimiento');
    });

    await test.step('an invalid range shows its error and does not search', async () => {
      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      await page.getByLabel('Desde (fecha)').fill('2027-10-01');
      await page.getByLabel('Hasta (fecha)').fill('2027-09-01');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(
        page.getByText('La fecha final no puede ser anterior a la inicial.'),
      ).toBeVisible();
    });

    await test.step('no match says so, and "Ver mes" opens the movement’s month', async () => {
      await page.getByRole('button', { name: 'Limpiar filtros' }).click();
      await page.getByLabel('Texto en concepto o notas').fill('esto no existe');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(results(page)).toContainText('Ningún movimiento coincide con los filtros.');

      await page.getByLabel('Texto en concepto o notas').fill('Compra Mercadona');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await results(page)
        .getByRole('button', { name: /Ver el mes de/ })
        .click();
      await expect(page.getByRole('textbox', { name: 'Mes' })).toHaveValue('2027-10');
      await expect(
        page.getByRole('table').filter({ hasText: 'zzbusca Compra Mercadona' }),
      ).toBeVisible();
      await expect(results(page)).toHaveCount(0);
    });

    await test.step('"Volver a la vista mensual" restores the month view', async () => {
      await page.getByRole('button', { name: 'Buscar y filtrar' }).click();
      await page.getByLabel('Texto en concepto o notas').fill('zzbusca');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(results(page)).toBeVisible();
      await results(page).getByRole('button', { name: 'Volver a la vista mensual' }).click();
      await expect(results(page)).toHaveCount(0);
      await expect(page.getByRole('navigation', { name: 'Mes' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Buscar y filtrar' })).toBeVisible();
    });

    await test.step('filters live in the URL: reload keeps them, back restores the previous ones', async () => {
      await page.getByRole('button', { name: 'Buscar y filtrar' }).click();
      await page.getByLabel('Texto en concepto o notas').fill('Compra Mercadona');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByTestId('search-totals')).toContainText('1 movimiento');
      await page.getByLabel('Texto en concepto o notas').fill('zzbusca Nómina');
      await page.getByLabel('Tipo').selectOption({ label: 'Ingreso' });
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(resultRows(page)).toContainText('Nómina de septiembre');
      await expect(page).toHaveURL(/q=zzbusca/);

      await page.reload();
      await expect(resultRows(page)).toContainText('Nómina de septiembre');
      await expect(page.getByLabel('Texto en concepto o notas')).toHaveValue('zzbusca Nómina');
      await expect(page.getByLabel('Tipo')).toHaveValue('income');

      await page.goBack();
      await expect(resultRows(page)).toContainText('Compra Mercadona');
      await expect(page.getByLabel('Texto en concepto o notas')).toHaveValue('Compra Mercadona');
      await expect(page.getByLabel('Tipo')).toHaveValue('');
    });

    await test.step('clearing every filter and searching drops the search from the URL', async () => {
      await page.getByLabel('Texto en concepto o notas').fill('');
      await page.getByLabel('Tipo').selectOption({ label: 'Todos' });
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page).not.toHaveURL(/q=/);
      await expect(page).not.toHaveURL(/kind=/);
      await expect(page.getByTestId('search-totals')).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Buscar y filtrar' })).toBeVisible();
    });

    await test.step('invalid params in the URL are ignored', async () => {
      await page.goto('/#/movements?month=2027-10&cat=abc&kind=zzz&from=hoy&min=-1');
      await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
      await expect(results(page)).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Buscar y filtrar' })).toBeVisible();
    });
  } finally {
    await cleanUp(request);
  }
});
