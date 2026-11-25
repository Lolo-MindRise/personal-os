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
    // Spending in the previous 12-month period, so Supermercado shows up under "changed most".
    await add('2025-01-10', groceries, 1_000);
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

    // Whole-period links: follow them and compare the search's expense total with Informes.
    const searchExpenses = async () => {
      await expect(page.getByRole('heading', { name: 'Movimientos', level: 1 })).toBeVisible();
      const panel = page.getByRole('form', { name: 'Buscar movimientos' });
      await expect(panel.getByLabel('Categoría')).toHaveValue(String(groceries));
      await expect(panel.getByLabel('Desde (fecha)')).toHaveValue('2025-02-01');
      await expect(panel.getByLabel('Hasta (fecha)')).toHaveValue('2026-01-31');
      const totals = page.getByTestId('search-totals');
      await expect(totals).toContainText('Gastos');
      const text = await totals.innerText();
      const match = /Gastos\s+([\d.,]+\s€)/.exec(text);
      expect(match, text).not.toBeNull();
      return toCents(match?.[1] ?? '');
    };
    await page.goto('/#/reports?month=2026-01&months=12');
    const averagesRow = page.getByTestId('table-averages').getByRole('row', {
      name: /^Supermercado/,
    });
    const periodTotal = toCents(await averagesRow.locator('td').nth(1).innerText());
    expect(periodTotal).toBe(5_555 + 17_670);
    await averagesRow.getByRole('link', { name: 'Supermercado' }).click();
    expect(await searchExpenses()).toBe(periodTotal);

    await page.goto('/#/reports?month=2026-01&months=12');
    const changed = page
      .getByTestId('list-changes')
      .getByRole('listitem')
      .filter({ hasText: 'Supermercado' });
    await expect(changed).toContainText('10,00');
    await changed.getByRole('link', { name: 'Supermercado' }).click();
    expect(await searchExpenses()).toBe(periodTotal);
  } finally {
    const failed: string[] = [];
    for (const id of created) {
      const res = await request.delete(`/api/movements/${String(id)}`);
      if (!res.ok()) failed.push(String(id));
    }
    expect(failed, 'movements that could not be deleted').toEqual([]);
  }
});
