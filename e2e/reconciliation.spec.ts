import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Account reconciliation (plan 0003, task 06) in production mode on the seeded temporary database.
// The test creates an account named "zzconciliar" with one movement; it removes the movement (to
// the trash and then for good), the account and its reconciliations afterwards.

const NAME = 'zzconciliar';
const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });

async function cleanUp(request: APIRequestContext) {
  const accounts = (await (await request.get('/api/accounts')).json()) as {
    id: number;
    name: string;
  }[];
  const account = accounts.find((a) => a.name === NAME);
  if (account === undefined) {
    return;
  }
  // The movement may still be live (the test failed early): move it to the trash first.
  const live = (await (await request.get('/api/movements/search?q=zzconciliar')).json()) as {
    rows: { id: number; accountId: number }[];
  };
  for (const row of live.rows.filter((m) => m.accountId === account.id)) {
    const response = await request.delete(`/api/movements/${String(row.id)}`);
    expect(response.ok()).toBe(true);
  }
  const inTrash = (await (await request.get('/api/trash')).json()) as {
    movements: { id: number; accountId: number }[];
  };
  for (const row of inTrash.movements.filter((m) => m.accountId === account.id)) {
    const response = await request.delete(`/api/trash/movements/${String(row.id)}`);
    expect(response.ok()).toBe(true);
  }
  // Deleting the account deletes its reconciliations.
  const removed = await request.delete(`/api/accounts/${String(account.id)}`);
  expect(removed.ok()).toBe(true);
}

test('reconcile with a bank balance 10 € different: the difference shows and the account remembers it', async ({
  page,
  request,
}) => {
  try {
    const categories = (await (await request.get('/api/categories')).json()) as {
      id: number;
      kind: string;
    }[];
    const income = categories.find((c) => c.kind === 'income');
    expect(income).toBeDefined();
    const created = await request.post('/api/accounts', {
      data: {
        name: NAME,
        type: 'bank',
        openingBalanceCents: 10_000,
        openingBalanceDate: '2020-01-01',
      },
    });
    expect(created.ok()).toBe(true);
    const account = (await created.json()) as { id: number };
    const movement = await request.post('/api/movements', {
      data: {
        date: '2020-03-01',
        kind: 'income',
        categoryId: income?.id,
        concept: 'zzconciliar ingreso',
        amountCents: 2_500,
        accountId: account.id,
      },
    });
    expect(movement.ok()).toBe(true);

    await page.goto('/');
    await nav(page, 'Cuentas').click();
    const row = page
      .getByRole('region', { name: 'Cuentas', exact: true })
      .getByRole('row', { name: new RegExp(NAME) });
    await expect(row).toContainText('125,00');
    await expect(row).toContainText('Sin conciliar');

    await row.getByRole('button', { name: 'Conciliar' }).click();
    await expect(page.getByText('nunca crea ajustes automáticos')).toBeVisible();
    await page.getByLabel('Saldo real del banco').fill('135');
    const result = page.getByRole('region', { name: 'Resultado de la conciliación' });
    await expect(result).toContainText('Saldo de la app a esa fecha: 125,00');
    await expect(result).toContainText('Diferencia (banco menos app): 10,00');
    await expect(result).toContainText('zzconciliar ingreso');

    // A date before the opening date is refused.
    await page.getByLabel('Fecha del saldo del banco').fill('2019-12-31');
    await page.getByRole('button', { name: 'Guardar conciliación' }).click();
    await expect(page.getByText(/anterior a la fecha del saldo inicial/).first()).toBeVisible();
    await page.getByLabel('Fecha del saldo del banco').fill('2030-01-01');

    await page.getByRole('button', { name: 'Guardar conciliación' }).click();
    await expect(row).toContainText('diferencia 10,00');
    // Saving changed nothing else: the balance is the same.
    await expect(row).toContainText('125,00');
  } finally {
    await cleanUp(request);
  }
});
