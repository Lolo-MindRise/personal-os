import { expect, test, type Page } from '@playwright/test';

// "Inicio" in production mode, on the seeded temporary database. The browser clock is fixed to
// January 2026, the seeded month: income 2.000,00, expenses 900,70, repayment 100,00; pending
// Internet, Electricidad and Gimnasio; budget Vivienda 700, Supermercado 350, Ocio 100; one debt
// of 3.000,00; one goal of 6.000,00 by 2026-12-31.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime('2026-01-15T12:00:00');
});

test('the dashboard is the default page and shows the key figures', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  await expect(nav(page, 'Inicio')).toHaveAttribute('aria-current', 'page');
  // First in the navigation.
  await expect(
    page.getByRole('navigation', { name: 'Secciones' }).getByRole('link').first(),
  ).toHaveText('Inicio');

  await expect(page.getByTestId('figure-accumulated')).toContainText(/999,30\s€/);
  await expect(page.getByTestId('figure-goal')).toContainText('Fondo de emergencia');
  await expect(page.getByTestId('figure-goal')).toContainText('20 %');
  await expect(page.getByTestId('figure-debt')).toContainText(/3\.000,00\s€/);
  // 999,30 − pending 130,00
  await expect(page.getByTestId('figure-projected')).toContainText(/869,30\s€/);
  // No initial balance yet: the card says so and links to where it is set.
  await expect(page.getByTestId('figure-accumulated')).toContainText('Sin saldo inicial');
});

test('both charts render with the seed data and have a text alternative', async ({ page }) => {
  await page.goto('/');
  const months = page.getByTestId('chart-months');
  await expect(months.locator('svg.recharts-surface').first()).toBeVisible();
  // 12 months of bars: only January has amounts, but every month has its slot on the axis.
  await expect(months.locator('.recharts-xAxis .recharts-cartesian-axis-tick')).toHaveCount(12);
  await expect(months.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await expect(months.locator('.chart-box')).toHaveAttribute(
    'aria-label',
    /Gráfico de los últimos 12 meses/,
  );
  await expect(months.locator('.chart-box')).toHaveAttribute('aria-label', /ingresos 2\.000,00\s€/);

  const categories = page.getByTestId('chart-categories');
  await expect(categories.locator('svg.recharts-surface').first()).toBeVisible();
  await expect(categories.locator('.recharts-bar-rectangle').first()).toBeVisible();
  await expect(categories.locator('.chart-box')).toHaveAttribute(
    'aria-label',
    /Ninguna categoría supera/,
  );

  // The same data as a table.
  await categories.getByText('Ver los datos').click();
  await expect(categories.getByRole('row', { name: /Supermercado/ })).toContainText(/176,70\s€/);
  await expect(categories.getByRole('row', { name: /Supermercado/ })).toContainText(/350,00\s€/);
});

test('an over-budget category is marked in words, not only in colour', async ({
  page,
  request,
}) => {
  const all = (await (await request.get('/api/categories')).json()) as {
    id: number;
    name: string;
  }[];
  const created = await request.post('/api/movements', {
    data: {
      date: '2026-01-28',
      kind: 'expense',
      categoryId: all.find((c) => c.name === 'Ocio')?.id,
      concept: 'Concierto de prueba',
      amountCents: 20_000,
    },
  });
  const { id } = (await created.json()) as { id: number };
  try {
    await page.goto('/');
    const categories = page.getByTestId('chart-categories');
    await expect(categories.locator('.chart-box')).toHaveAttribute(
      'aria-label',
      /Superan su presupuesto: Ocio/,
    );
    await categories.getByText('Ver los datos').click();
    await expect(categories.getByRole('row', { name: /Ocio/ })).toContainText('Excedido');
  } finally {
    await request.delete(`/api/movements/${String(id)}`);
  }
});

test('debts, goal and upcoming items, with links to their screens', async ({ page }) => {
  await page.goto('/');
  const debt = page.getByTestId('debt-card');
  await expect(debt).toContainText('Préstamo personal de ejemplo');
  await expect(debt).toContainText('20 cuotas restantes');
  await expect(debt.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');

  await expect(page.getByTestId('goal-card')).toContainText('Fondo de emergencia');
  await expect(page.getByTestId('goal-card').getByRole('progressbar')).toHaveAttribute(
    'aria-valuenow',
    '20',
  );

  const pending = page.getByTestId('upcoming-pending');
  await expect(pending.getByRole('listitem')).toHaveCount(3);
  await expect(pending).toContainText('Gimnasio');
  await expect(page.getByTestId('upcoming-milestones')).toContainText('Liquidar el préstamo');

  await page.getByRole('button', { name: 'Ver todos los hitos' }).click();
  await expect(page.getByRole('heading', { name: 'Hitos', level: 1 })).toBeVisible();
});

test('the month selector changes the figures, and the 12 months end at that month', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Mes siguiente' }).click();
  await expect(page.locator('.month-label')).toHaveText('febrero de 2026');
  // February: nothing confirmed, all five fixed items pending, accumulated stays.
  await expect(page.getByTestId('upcoming-pending').getByRole('listitem')).toHaveCount(5);
  await expect(page.getByTestId('figure-accumulated')).toContainText(/999,30\s€/);
  await expect(page.getByTestId('chart-months')).toContainText(
    'De marzo de 2025 a febrero de 2026',
  );
});
