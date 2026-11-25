import { readFileSync } from 'node:fs';
import { expect, test, type APIRequestContext } from '@playwright/test';

// CSV export of movements, in production mode on the seeded temporary database.
// Everything created is dated in 2027-11 and carries "zzexporta" in its concept; removed afterwards.

async function cleanUp(request: APIRequestContext) {
  const rows = (await (await request.get('/api/movements?month=2027-11')).json()) as {
    id: number;
  }[];
  for (const row of rows) {
    await request.delete(`/api/movements/${String(row.id)}`);
  }
}

test('exports the month and every search result as a Spanish CSV', async ({ page, request }) => {
  try {
    const categories = (await (await request.get('/api/categories')).json()) as {
      id: number;
      name: string;
    }[];
    const groceries = categories.find((c) => c.name === 'Supermercado')?.id ?? 0;
    expect(groceries).toBeGreaterThan(0);
    const add = async (data: Record<string, unknown>) => {
      expect((await request.post('/api/movements', { data })).status()).toBe(201);
    };
    await add({
      date: '2027-11-03',
      kind: 'expense',
      categoryId: groceries,
      concept: 'zzexporta "Compra"; con ñ',
      amountCents: 123_456,
    });
    // More than one page of 50 results.
    for (let i = 1; i <= 52; i++) {
      await add({
        date: '2027-11-10',
        kind: 'expense',
        categoryId: groceries,
        concept: `zzexporta pan ${String(i).padStart(2, '0')}`,
        amountCents: 100,
      });
    }

    await test.step('the month', async () => {
      await page.goto('/#/movements?month=2027-11');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Exportar mes' }).click(),
      ]);
      expect(download.suggestedFilename()).toBe('movimientos-2027-11.csv');
      const text = readFileSync(await download.path(), 'utf8');
      expect(text.startsWith('﻿Fecha;Tipo;Categoría;Concepto;Importe;Notas;Marcas\r\n')).toBe(true);
      expect(text).toContain(
        '03/11/2027;Gasto;Supermercado;"zzexporta ""Compra""; con ñ";1.234,56;',
      );
      expect(text.trim().split('\r\n')).toHaveLength(54);
    });

    await test.step('all search results, beyond the first page', async () => {
      await page.getByRole('button', { name: 'Buscar y filtrar' }).click();
      await page.getByLabel('Texto en concepto o notas').fill('zzexporta');
      await page.getByRole('button', { name: 'Buscar', exact: true }).click();
      await expect(page.getByTestId('search-totals')).toContainText('53 movimientos');
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Exportar resultados' }).click(),
      ]);
      expect(download.suggestedFilename()).toBe('movimientos-busqueda.csv');
      const text = readFileSync(await download.path(), 'utf8');
      expect(text.trim().split('\r\n')).toHaveLength(54);
      expect(text).toContain('10/11/2027;Gasto;Supermercado;zzexporta pan 52;1,00;');
    });
  } finally {
    await cleanUp(request);
  }
});
