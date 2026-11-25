import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Cuentas screen in production mode, on the seeded temporary database.
// The test removes the transfers and the account it creates.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });

async function cleanUp(request: APIRequestContext, accountName: string) {
  const accounts = (await (await request.get('/api/accounts')).json()) as {
    id: number;
    name: string;
  }[];
  const account = accounts.find((a) => a.name === accountName);
  if (account === undefined) {
    return;
  }
  const transfers = (await (await request.get('/api/transfers')).json()) as {
    id: number;
    fromAccountId: number;
    toAccountId: number;
  }[];
  for (const t of transfers.filter(
    (x) => x.fromAccountId === account.id || x.toAccountId === account.id,
  )) {
    await request.delete(`/api/transfers/${String(t.id)}`);
  }
  await request.delete(`/api/accounts/${String(account.id)}`);
}

test('create an account, move money into it and see the balance', async ({ page, request }) => {
  const name = 'Hucha de prueba';
  try {
    await page.goto('/');
    await nav(page, 'Cuentas').click();
    await expect(page.getByRole('heading', { name: 'Cuentas', level: 1 })).toBeVisible();

    await page.getByRole('button', { name: 'Añadir cuenta' }).click();
    await page.getByLabel('Nombre').fill(name);
    await page.getByLabel('Saldo inicial de la cuenta', { exact: true }).fill('50');
    await page.getByLabel('Fecha del saldo inicial de la cuenta').fill('2020-01-01');
    await page.getByRole('button', { name: 'Guardar cuenta' }).click();
    const row = page
      .getByRole('region', { name: 'Cuentas', exact: true })
      .getByRole('row', { name: new RegExp(name) });
    await expect(row).toContainText('50,00');

    await page.getByRole('button', { name: 'Registrar transferencia' }).click();
    await page.getByLabel('Importe').fill('20');
    await page.getByLabel('Cuenta de origen').selectOption({ label: 'Principal' });
    await page.getByLabel('Cuenta de destino').selectOption({ label: name });
    await page.getByRole('button', { name: 'Guardar transferencia' }).click();
    await expect(row).toContainText('70,00');

    page.once('dialog', (dialog) => void dialog.accept());
    await page
      .getByRole('region', { name: 'Transferencias' })
      .getByRole('button', { name: 'Eliminar' })
      .first()
      .click();
    await expect(row).toContainText('50,00');

    // An account with transfers cannot be deleted: covered by the API tests.
  } finally {
    await cleanUp(request, name);
  }
});
