import { expect, test, type Page } from '@playwright/test';

// The projection screen in production mode, on the seeded temporary database. The browser clock is
// fixed to March 2028, so the projected months never depend on when the test runs. The test only
// reads data (scenarios live in the page), so there is nothing to clean up.

const NOW = '2028-03-15T12:00:00';
const TODAY = '2028-03-15';

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name });
const tableRows = (page: Page) => page.locator('table.projection-table tbody tr');
const row = (page: Page, label: string) => tableRows(page).filter({ hasText: label });

const NBSP = String.fromCharCode(160);

/** Cents as the app shows them: always grouped, a no-break space before the euro sign. */
const eur = (cents: number) => {
  const abs = Math.abs(cents);
  const euros = Math.trunc(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cents < 0 ? '-' : ''}${euros},${String(abs % 100).padStart(2, '0')}${NBSP}€`;
};

interface ApiProjection {
  baselineCents: number;
  months: { month: string; accumulatedCents: number }[];
}

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(NOW);
  await page.goto('/');
  await nav(page, 'Proyección').click();
  await expect(page.getByRole('heading', { name: 'Proyección', level: 1 })).toBeVisible();
});

test('the projection shows the chart, the months, the goals and what it includes', async ({
  page,
  request,
}) => {
  await expect(page.getByTestId('chart-projection')).toBeVisible();
  await expect(page.getByTestId('chart-projection').locator('.chart-box')).toHaveAttribute(
    'aria-label',
    /Gráfico de la proyección\. De marzo de 2028 a febrero de 2029/,
  );
  // Twelve months by default, the current one included.
  await expect(tableRows(page)).toHaveCount(12);
  await expect(tableRows(page).first()).toContainText('marzo de 2028');
  await expect(page.getByRole('region', { name: 'Qué incluye la proyección' })).toContainText(
    'No incluye',
  );
  await expect(page.getByRole('region', { name: 'Objetivos en la proyección' })).toContainText(
    'Fondo de emergencia',
  );

  await test.step('a goal far above everything projected is still drawn, by name', async () => {
    // Recharts drops reference lines outside the axis unless told to extend it. Goals cannot be
    // deleted; this one has a far date, so no other spec's "next goal" changes.
    const created = await request.post('/api/goals', {
      data: {
        name: 'meta lejana de prueba',
        targetAmountCents: 500_000_000,
        targetDate: '2040-01-31',
      },
    });
    expect(created.status()).toBe(201);
    await page.reload();
    await nav(page, 'Proyección').click();
    await expect(
      page.getByTestId('chart-projection').getByText('meta lejana de prueba'),
    ).toBeVisible();
    await expect(
      page.getByTestId('chart-projection').getByText('Fondo de emergencia'),
    ).toBeVisible();
  });

  await test.step('the end month changes the range, and an earlier one is refused', async () => {
    await page.getByLabel('Proyectar hasta (mes)').fill('2028-08');
    await expect(tableRows(page)).toHaveCount(6);
    await page.getByLabel('Proyectar hasta (mes)').fill('2028-01');
    await expect(page.getByText('El mes final no puede ser anterior al mes actual.')).toBeVisible();
    await expect(page.getByTestId('chart-projection')).toHaveCount(0);
    await page.getByLabel('Proyectar hasta (mes)').fill('2038-12');
    await expect(page.getByText(/no puede estar a más de 120 meses/)).toBeVisible();
  });
});

test('scenarios are compared with the base from the right month, and are not saved', async ({
  page,
  request,
}) => {
  await page.getByLabel('Proyectar hasta (mes)').fill('2028-08');
  await expect(tableRows(page)).toHaveCount(6);
  const base = (await (
    await request.get(`/api/projection?to=2028-08&today=${TODAY}`)
  ).json()) as ApiProjection;
  const accumulated = (month: string) =>
    base.months.find((m) => m.month === month)?.accumulatedCents ?? Number.NaN;
  const type = page.getByLabel('Ajuste', { exact: true });

  await test.step('extra income from May: April is unchanged, June has two extra months', async () => {
    await page.getByLabel('Desde (mes)').fill('2028-05');
    await page.getByLabel('Ingresos al mes: más o menos (€)').fill('+200');
    await page.getByRole('button', { name: 'Añadir ajuste' }).click();
    await expect(page.getByText('Desde 05/2028: ingresos +200,00 € al mes')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Acumulado con escenario' })).toBeVisible();
    // Columns: month, income, expenses, repayments, savings, accumulated, accumulated with scenario.
    const scenarioCell = (label: string) => row(page, label).locator('td').last();
    await expect(scenarioCell('abril de 2028')).toHaveText(eur(accumulated('2028-04')));
    await expect(scenarioCell('mayo de 2028')).toHaveText(eur(accumulated('2028-05') + 20_000));
    await expect(scenarioCell('junio de 2028')).toHaveText(eur(accumulated('2028-06') + 40_000));
    await expect(scenarioCell('agosto de 2028')).toHaveText(eur(accumulated('2028-08') + 80_000));
    // The base column does not change.
    await expect(row(page, 'junio de 2028')).toContainText(eur(accumulated('2028-06')));
    // The chart's text alternative mentions both results.
    await expect(page.getByTestId('chart-projection').locator('.chart-box')).toHaveAttribute(
      'aria-label',
      /con el escenario/,
    );
  });

  await test.step('an expense category can be set to another amount', async () => {
    await type.selectOption({ label: 'Una categoría de gasto pasa a otro importe' });
    await page.getByLabel('Categoría de gasto').selectOption({ label: 'Ocio' });
    await page.getByLabel('Desde (mes)').fill('2028-04');
    await page.getByLabel('Nuevo gasto al mes (€)').fill('0');
    await page.getByRole('button', { name: 'Añadir ajuste' }).click();
    await expect(page.getByText('Desde 04/2028: «Ocio» pasa a 0,00 € al mes')).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Ajustes del escenario' }).getByRole('listitem'),
    ).toHaveCount(2);
  });

  await test.step('a scenario outside the range or with a bad amount shows its error', async () => {
    await type.selectOption({ label: 'Cambio en los ingresos mensuales' });
    await page.getByLabel('Desde (mes)').fill('2027-01');
    await page.getByLabel('Ingresos al mes: más o menos (€)').fill('10');
    await page.getByRole('button', { name: 'Añadir ajuste' }).click();
    await expect(page.getByText('El mes debe estar entre 03/2028 y 08/2028.')).toBeVisible();
    await page.getByLabel('Desde (mes)').fill('2028-05');
    await page.getByLabel('Ingresos al mes: más o menos (€)').fill('0');
    await page.getByRole('button', { name: 'Añadir ajuste' }).click();
    await expect(page.getByText('Importe cero.')).toBeVisible();
  });

  await test.step('removing the adjustments goes back to the base only', async () => {
    await page.getByRole('button', { name: 'Quitar todos los ajustes' }).click();
    await expect(page.getByRole('columnheader', { name: 'Acumulado con escenario' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('region', { name: 'Ajustes del escenario' })).toHaveCount(0);
  });

  await test.step('nothing was stored: a reload starts without scenarios', async () => {
    await page.reload();
    await nav(page, 'Proyección').click();
    await expect(page.getByRole('columnheader', { name: 'Acumulado con escenario' })).toHaveCount(
      0,
    );
  });
});
