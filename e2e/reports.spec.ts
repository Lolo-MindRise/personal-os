import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// "Informes" in production mode on the seeded temporary database. The browser clock is fixed to
// January 2026 (the seeded month). The test adds expenses in 2025-11 and 2025-12 and removes
// them afterwards.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });

/** `'1.234,56 €'` → 123456. */
const toCents = (text: string) => {
  const digits = text.replace(/[^\d,-]/g, '').replace(',', '.');
  return Math.round(Number(digits) * 100);
};

async function categoryId(request: APIRequestContext, name: string): Promise<number> {
  const all = (await (await request.get('/api/categories')).json()) as {
    id: number;
    name: string;
  }[];
  return all.find((c) => c.name === name)?.id ?? 0;
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime('2026-01-15T12:00:00');
});

test('Informes is under Seguimiento and shows the charts for the seeded month', async ({
  page,
}) => {
  await page.goto('/');
  await nav(page, 'Informes').click();
  await expect(page.getByRole('heading', { name: 'Informes', level: 1 })).toBeVisible();
  await expect(nav(page, 'Informes')).toHaveAttribute('aria-current', 'page');
  const stacked = page.getByTestId('chart-stacked');
  await expect(stacked.locator('svg.recharts-surface').first()).toBeVisible();
  await expect(stacked.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await expect(
    page.getByTestId('chart-trend').locator('svg.recharts-surface').first(),
  ).toBeVisible();
  await expect(page.getByTestId('list-changes')).toHaveCount(0);
  await expect(page.getByTestId('changes-empty')).toBeVisible();
  // The period selector changes the number of months.
  await page.getByRole('button', { name: '12 meses' }).click();
  await expect(stacked.locator('.recharts-xAxis .recharts-cartesian-axis-tick')).toHaveCount(12);
});

test('12-month totals of two months equal the movements screen totals per category', async ({
  page,
  request,
}) => {
  const groceries = await categoryId(request, 'Supermercado');
  const leisure = await categoryId(request, 'Ocio');
  const created: number[] = [];
  const add = async (date: string, category: number, amountCents: number) => {
    const response = await request.post('/api/movements', {
      data: {
        date,
        kind: 'expense',
        categoryId: category,
        concept: 'Informe de prueba',
        amountCents,
      },
    });
    expect(response.ok()).toBe(true);
    created.push(((await response.json()) as { id: number }).id);
  };
  try {
    await add('2025-12-03', groceries, 4_321);
    await add('2025-12-20', groceries, 1_234);
    await add('2025-12-21', leisure, 999);
    await page.goto('/#/reports?month=2026-01&months=12');
    await page.getByTestId('chart-stacked').getByText('Ver los datos').click();
    const table = page.getByTestId('table-stacked');
    const row = table.getByRole('row', { name: /^Supermercado/ });
    // Columns: category, 12 months (oldest first), total. December 2025 is the 11th month.
    const cell = (index: number) => row.locator('td').nth(index);
    const informes = {
      '2025-12': toCents(await cell(10).innerText()),
      '2026-01': toCents(await cell(11).innerText()),
    };
    expect(informes['2025-12']).toBe(5_555);
    expect(informes['2026-01']).toBe(17_670);

    const links = {
      '2025-12': await cell(10).getByRole('link').getAttribute('href'),
      '2026-01': await cell(11).getByRole('link').getAttribute('href'),
    };
    for (const [month, expected] of Object.entries(informes)) {
      // Follow the link of that cell, as a click would.
      const href = links[month as keyof typeof links];
      expect(href, month).toContain(`month=${month}`);
      await page.goto(`/${href ?? ''}`);
      await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
      await expect(page.locator('.filter-bar')).toContainText('Supermercado');
      const amounts = await page.locator('table.movements tbody td.amount').allInnerTexts();
      const total = amounts.reduce((sum, text) => sum + toCents(text), 0);
      expect(total, month).toBe(expected);
    }
  } finally {
    for (const id of created) {
      const res = await request.delete(`/api/movements/${String(id)}`);
      expect(res.ok(), `delete movement ${String(id)}`).toBe(true);
    }
  }
});
