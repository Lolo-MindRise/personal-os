import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// CSV import into a second account whose opening date is after some rows of the file. Everything
// happens in August 2027. The test removes what it creates (movements for good, rule, account).

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });

const ACCOUNT = 'Cuenta de importación';
const CSV = [
  'Fecha;Concepto;Importe',
  '09/08/2027;PRUEBAFLAG antes;-3,11',
  '10/08/2027;PRUEBAFLAG mismo dia;-4,22',
  '11/08/2027;PRUEBAFLAG despues;-5,33',
  '',
].join('\n');

async function cleanUp(request: APIRequestContext, ruleId: number | undefined) {
  const failures: string[] = [];
  const check = (response: { ok: () => boolean; status: () => number }, what: string) => {
    if (!response.ok()) {
      failures.push(`${what}: ${String(response.status())}`);
    }
  };
  const movements = (await (await request.get('/api/movements?month=2027-08')).json()) as {
    id: number;
    concept: string;
  }[];
  for (const movement of movements.filter((m) => m.concept.startsWith('PRUEBAFLAG'))) {
    check(await request.delete(`/api/movements/${String(movement.id)}`), 'soft delete');
    check(await request.delete(`/api/trash/movements/${String(movement.id)}`), 'permanent delete');
  }
  if (ruleId !== undefined) {
    check(await request.delete(`/api/category-rules/${String(ruleId)}`), 'rule');
  }
  const accounts = (await (await request.get('/api/accounts')).json()) as {
    id: number;
    name: string;
  }[];
  const account = accounts.find((a) => a.name === ACCOUNT);
  if (account !== undefined) {
    check(await request.delete(`/api/accounts/${String(account.id)}`), 'account');
  }
  expect(failures).toEqual([]);
}

test('importing into a second account flags and unchecks rows on or before its opening date', async ({
  page,
  request,
}) => {
  let ruleId: number | undefined;
  try {
    const categories = (await (await request.get('/api/categories')).json()) as {
      id: number;
      name: string;
    }[];
    const category = categories.find((c) => c.name === 'Supermercado');
    expect(category).toBeDefined();
    const rule = await request.post('/api/category-rules', {
      data: { pattern: 'PRUEBAFLAG', categoryId: category?.id },
    });
    expect(rule.status()).toBe(201);
    ruleId = ((await rule.json()) as { id: number }).id;
    const created = await request.post('/api/accounts', {
      data: {
        name: ACCOUNT,
        type: 'bank',
        openingBalanceCents: 0,
        openingBalanceDate: '2027-08-10',
      },
    });
    expect(created.status()).toBe(201);
    const accountId = ((await created.json()) as { id: number }).id;

    await page.goto('/');
    await nav(page, 'Importar').click();
    await page.getByLabel('Cuenta de destino').selectOption({ label: ACCOUNT });
    await page.getByLabel('Archivo CSV').setInputFiles({
      name: 'extracto.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV, 'utf8'),
    });
    await page.getByRole('button', { name: 'Ver vista previa' }).click();

    const row = (text: string) =>
      page.locator('table.import-preview tbody tr').filter({ hasText: text });
    await test.step('the rows on or before the opening date are flagged and unchecked', async () => {
      await expect(row('antes')).toContainText('Fuera del saldo de la cuenta');
      await expect(row('antes').getByRole('checkbox')).not.toBeChecked();
      await expect(row('mismo dia')).toContainText('Fuera del saldo de la cuenta');
      await expect(row('mismo dia').getByRole('checkbox')).not.toBeChecked();
      await expect(row('despues')).not.toContainText('Fuera del saldo de la cuenta');
      await expect(row('despues').getByRole('checkbox')).toBeChecked();
      await expect(
        row('antes').getByRole('link', { name: /fecha del saldo inicial/ }),
      ).toHaveAttribute('href', '#/accounts');
    });

    await test.step('changing the account re-evaluates the flags and keeps manual choices', async () => {
      await row('antes').getByRole('checkbox').check(); // manual choice on a flagged row
      await page.getByLabel('Cuenta de destino').selectOption({ label: 'Principal' });
      await expect(row('mismo dia')).not.toContainText('Fuera del saldo de la cuenta');
      await expect(row('mismo dia').getByRole('checkbox')).toBeChecked();
      await page.getByLabel('Cuenta de destino').selectOption({ label: ACCOUNT });
      await expect(row('mismo dia')).toContainText('Fuera del saldo de la cuenta');
      await expect(row('mismo dia').getByRole('checkbox')).not.toBeChecked();
      await expect(row('antes').getByRole('checkbox')).toBeChecked();
    });

    await test.step('the import creates the movements in the chosen account', async () => {
      await page.getByRole('button', { name: 'Importar 2 filas' }).click();
      await expect(page.locator('p.import-summary')).toContainText('2 movimientos nuevos');
      const stored = (await (await request.get('/api/movements?month=2027-08')).json()) as {
        concept: string;
        accountId: number;
      }[];
      expect(stored.map((m) => [m.concept, m.accountId]).sort()).toEqual([
        ['PRUEBAFLAG antes', accountId],
        ['PRUEBAFLAG despues', accountId],
      ]);
    });
  } finally {
    await cleanUp(request, ruleId);
  }
});
