import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// CSV import in production mode, on the seeded temporary database. Everything happens in June
// 2027: the seed has fixed items from 2026-01 without end (Nómina 2.000,00 on day 1, Alquiler
// 700,00 on day 2), so both are pending that month. The test removes what it creates.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });

const CSV = [
  'Fecha;Concepto;Importe',
  '01/06/2027;INGRESO EMPRESA SL;2.000,00',
  '02/06/2027;RECIBO ALQUILER JUNIO;-700,00',
  '03/06/2027;COMPRA MERCADONA 0042;-45,30',
  '05/06/2027;Tienda rara;-12,00',
  '31/02/2027;Fecha imposible;-1,00',
  '07/06/2027;Ya registrado;-9,99',
  '',
].join('\n');

async function cleanUp(request: APIRequestContext) {
  const movements = (await (await request.get('/api/movements?month=2027-06')).json()) as {
    id: number;
  }[];
  for (const movement of movements) {
    await request.delete(`/api/movements/${String(movement.id)}`);
  }
  const rules = (await (await request.get('/api/category-rules')).json()) as { id: number }[];
  for (const rule of rules) {
    await request.delete(`/api/category-rules/${String(rule.id)}`);
  }
}

test('import a bank CSV: rules, a duplicate, fixed items, a bad row, and a re-import', async ({
  page,
  request,
}) => {
  try {
    // A movement that is already in the database: the file's last row duplicates it.
    const categories = (await (await request.get('/api/categories')).json()) as {
      id: number;
      name: string;
    }[];
    const leisure = categories.find((c) => c.name === 'Ocio');
    expect(leisure).toBeDefined();
    const existing = await request.post('/api/movements', {
      data: {
        date: '2027-06-07',
        kind: 'expense',
        categoryId: leisure?.id,
        concept: 'Ya registrado',
        amountCents: 999,
      },
    });
    expect(existing.status()).toBe(201);

    await page.goto('/');
    await nav(page, 'Importar').click();
    await expect(page.getByRole('heading', { name: 'Importar', level: 1 })).toBeVisible();

    await test.step('add a category rule', async () => {
      await page.getByLabel('El concepto contiene').fill('mercadona');
      await page
        .getByLabel('Categoría', { exact: true })
        .selectOption({ label: 'Supermercado (gasto)' });
      await page.getByRole('button', { name: 'Añadir regla' }).click();
      await expect(page.getByText('«mercadona» → Supermercado')).toBeVisible();
    });

    await test.step('choose the file: the columns are guessed from the header', async () => {
      await page.getByLabel('Archivo CSV').setInputFiles({
        name: 'extracto.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(CSV, 'utf8'),
      });
      await expect(page.getByLabel('Separador')).toHaveValue(';');
      await expect(page.getByLabel('Fecha', { exact: true })).toHaveValue('0');
      await expect(page.getByLabel('Concepto', { exact: true })).toHaveValue('1');
      await expect(page.getByLabel('Columna del importe')).toHaveValue('2');
      await page.getByRole('button', { name: 'Ver vista previa' }).click();
    });

    const row = (text: string) =>
      page.locator('table.import-preview tbody tr').filter({ hasText: text });
    await test.step('every row is classified, with its status in words', async () => {
      await expect(page.getByTestId('import-counts')).toContainText(
        '6 filas: 1 nuevas, 2 que confirman un fijo, 1 duplicadas, 1 sin categoría y 1 con errores',
      );
      await expect(page.getByTestId('import-counts')).toContainText('Marcadas para importar: 3');
      await expect(row('INGRESO EMPRESA')).toContainText('Confirma un fijo');
      await expect(row('INGRESO EMPRESA')).toContainText('Fijo «Nómina»');
      await expect(row('RECIBO ALQUILER')).toContainText('Fijo «Alquiler»');
      await expect(row('MERCADONA')).toContainText('Nuevo');
      await expect(row('MERCADONA')).toContainText(/-45,30\s€/);
      await expect(row('Ya registrado')).toContainText('Duplicado');
      await expect(row('Ya registrado').getByRole('checkbox')).not.toBeChecked();
      await expect(row('Tienda rara')).toContainText('Falta la categoría');
      await expect(row('Fecha imposible')).toContainText(
        'Línea 6: La fecha no existe en el calendario.',
      );
    });

    await test.step('pick a category for the row that has none, and import', async () => {
      await row('Tienda rara').getByRole('combobox').selectOption({ label: 'Ocio' });
      await expect(row('Tienda rara').getByRole('checkbox')).toBeChecked();
      await expect(page.getByRole('button', { name: 'Importar 4 filas' })).toBeEnabled();
      await page.getByRole('button', { name: 'Importar 4 filas' }).click();
      await expect(page.locator('p.import-summary')).toContainText(
        'Importación terminada: 2 movimientos nuevos y 2 fijos confirmados',
      );
    });

    await test.step('the movements exist, fixed items are confirmed', async () => {
      const stored = (await (await request.get('/api/movements?month=2027-06')).json()) as {
        concept: string;
        recurringItemId: number | null;
        amountCents: number;
      }[];
      expect(stored.map((m) => m.concept).sort()).toEqual(
        [
          'COMPRA MERCADONA 0042',
          'INGRESO EMPRESA SL',
          'RECIBO ALQUILER JUNIO',
          'Tienda rara',
          'Ya registrado',
        ].sort(),
      );
      expect(stored.filter((m) => m.recurringItemId !== null)).toHaveLength(2);
      const pending = (await (await request.get('/api/months/2027-06/pending')).json()) as {
        concept: string;
      }[];
      expect(pending.map((p) => p.concept)).not.toContain('Nómina');
      expect(pending.map((p) => p.concept)).not.toContain('Alquiler');
    });

    await test.step('the same file again finds only duplicates and errors, with the mapping remembered', async () => {
      await page.reload();
      await nav(page, 'Importar').click();
      await page.getByLabel('Archivo CSV').setInputFiles({
        name: 'extracto.csv',
        mimeType: 'text/csv',
        buffer: Buffer.from(CSV, 'utf8'),
      });
      await expect(page.getByLabel('Columna del importe')).toHaveValue('2');
      await page.getByRole('button', { name: 'Ver vista previa' }).click();
      await expect(page.getByTestId('import-counts')).toContainText(
        '5 duplicadas',
        // The rule still gives MERCADONA its category, but every row is already stored.
      );
      await expect(page.getByTestId('import-counts')).toContainText('Marcadas para importar: 0');
      await expect(page.getByRole('button', { name: /Importar 0 filas/ })).toBeDisabled();
    });
  } finally {
    await cleanUp(request);
  }
});

test('a bank row for a fixed item already confirmed by hand is flagged, not counted twice', async ({
  page,
  request,
}) => {
  try {
    // The rent (700,00, day 2) is confirmed in Fijos for June 2027, with the item's own concept.
    const items = (await (await request.get('/api/recurring-items')).json()) as {
      id: number;
      concept: string;
    }[];
    const rent = items.find((i) => i.concept === 'Alquiler');
    expect(rent).toBeDefined();
    const confirmed = await request.post(
      `/api/recurring-items/${String(rent?.id ?? 0)}/months/2027-06/confirm`,
      { data: {} },
    );
    expect(confirmed.status()).toBe(201);

    await page.goto('/');
    await nav(page, 'Importar').click();
    const csv = [
      'Fecha;Concepto;Importe',
      '20/06/2027;RECIBO PISO JUNIO;-700,00',
      '21/06/2027;Tienda rara;-12,00',
      '',
    ].join('\n');
    await page.getByLabel('Archivo CSV').setInputFiles({
      name: 'extracto.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    });
    await page.getByRole('button', { name: 'Ver vista previa' }).click();

    const row = (text: string) =>
      page.locator('table.import-preview tbody tr').filter({ hasText: text });
    await expect(row('RECIBO PISO')).toContainText('Duplicado');
    await expect(row('RECIBO PISO')).toContainText('ya confirmado como fijo');
    await expect(row('RECIBO PISO').getByRole('checkbox')).not.toBeChecked();
    await expect(row('Tienda rara')).toContainText('Falta la categoría');
    await expect(page.getByTestId('import-counts')).toContainText('1 duplicadas');
    await expect(page.getByTestId('import-counts')).toContainText('Marcadas para importar: 0');
  } finally {
    await cleanUp(request);
  }
});

test('a Latin-1 file with Spanish accents and a comma delimiter is read correctly', async ({
  page,
  request,
}) => {
  try {
    await page.goto('/');
    await nav(page, 'Importar').click();
    // Windows-1252: "ó" is the single byte 0xF3, invalid as UTF-8. Amounts are quoted because
    // they use a decimal comma in a comma-separated file.
    const csv = 'fecha,descripción,importe\n10/06/2027,Nómina extra,"1.234,56"\n';
    await page.getByLabel('Archivo CSV').setInputFiles({
      name: 'latin1.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'latin1'),
    });
    await expect(page.getByLabel('Separador')).toHaveValue(',');
    await page.getByRole('button', { name: 'Ver vista previa' }).click();
    const row = page.locator('table.import-preview tbody tr').filter({ hasText: 'Nómina extra' });
    await expect(row).toContainText(/1\.234,56\s€/);
    await expect(row).toContainText('Falta la categoría');
  } finally {
    await cleanUp(request);
  }
});
