import { expect, test } from '@playwright/test';

// Budget alerts on the seeded database. The seeded Ocio budget (100,00 from 2025-11) applies to
// March 2031, which has no other data, so one movement of 85,00 puts Ocio at 85 %.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime('2031-03-15T12:00:00');
});

test('a category at 85 % appears on Inicio and Presupuesto shows its bar', async ({
  page,
  request,
}) => {
  const categories = (await (await request.get('/api/categories')).json()) as {
    id: number;
    name: string;
  }[];
  const leisure = categories.find((c) => c.name === 'Ocio')?.id ?? 0;
  expect(leisure).toBeGreaterThan(0);
  const created = await request.post('/api/movements', {
    data: {
      date: '2031-03-10',
      kind: 'expense',
      categoryId: leisure,
      concept: 'zzalert Ocio',
      amountCents: 8_500,
    },
  });
  expect(created.status()).toBe(201);
  const { id } = (await created.json()) as { id: number };
  try {
    await page.goto('/');
    const alerts = page.getByTestId('budget-alerts');
    await expect(alerts).toContainText('Ocio: 85 % del presupuesto');
    await expect(page.getByTestId('budget-alerts-warning')).toContainText('Ocio');
    await expect(page.getByTestId('budget-alerts-over')).toHaveCount(0);

    await alerts.getByRole('link', { name: 'Ocio' }).click();
    await expect(page).toHaveURL(/#\/movements\?.*category=\d+/);
    await expect(page).toHaveURL(/month=2031-03/);
    await expect(
      page.locator('table.movements tbody tr', { hasText: 'zzalert Ocio' }),
    ).toBeVisible();

    await page.goto('/#/budget');
    const bar = page.getByRole('progressbar', { name: 'Ocio: 85 % del presupuesto' });
    await expect(bar).toBeVisible();
    await expect(page.locator('table.budget tbody tr', { hasText: 'Ocio' })).toContainText(
      'Cerca del presupuesto',
    );
  } finally {
    const soft = await request.delete(`/api/movements/${String(id)}`);
    expect(soft.ok()).toBe(true);
    const purged = await request.delete(`/api/trash/movements/${String(id)}`);
    expect(purged.ok()).toBe(true);
  }
});
