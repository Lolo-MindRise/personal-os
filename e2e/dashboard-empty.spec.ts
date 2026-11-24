import { expect, test } from '@playwright/test';

// "Inicio" on a fresh database (no seed): every block says what to set up and links to the
// screen that does it. Runs against its own production server (see playwright.config.ts).

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime('2026-03-15T12:00:00');
});

test('every block looks sensible with no data and points to what to set up', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await expect(page.getByTestId('figure-accumulated')).toContainText(/0,00\s€/);
  await expect(page.getByTestId('figure-accumulated')).toContainText('Sin saldo inicial');
  await expect(page.getByTestId('figure-goal')).toContainText('Aún no tienes objetivos');
  await expect(page.getByTestId('figure-debt')).toContainText('No has registrado deudas');
  await expect(page.getByTestId('figure-projected')).toContainText('Aún no hay movimientos');

  // No charts to draw: an empty state instead.
  await expect(page.getByTestId('chart-months')).toHaveCount(0);
  await expect(page.getByTestId('chart-categories')).toHaveCount(0);
  await expect(
    page.getByText('Aún no hay movimientos, así que no hay nada que dibujar.'),
  ).toBeVisible();
  await expect(page.getByText('Sin presupuesto ni gastos en este mes.')).toBeVisible();
  await expect(
    page.locator('.dashboard-empty').filter({ hasText: 'No has registrado deudas.' }),
  ).toBeVisible();
  await expect(page.getByText('No queda ningún fijo pendiente este mes.')).toBeVisible();
  await expect(page.getByText('No hay hitos pendientes.')).toBeVisible();
});

test('the links open the screen that fixes each gap', async ({ page }) => {
  await page.goto('/');
  const cases: [string, string][] = [
    ['Definir un presupuesto', 'Presupuesto'],
    ['Añadir un hito', 'Hitos'],
    ['Añadir un objetivo', 'Objetivos'],
  ];
  for (const [link, heading] of cases) {
    await page.getByRole('link', { name: link }).first().click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Secciones' })
      .getByRole('link', { name: 'Inicio' })
      .click();
    await expect(page.getByRole('heading', { name: 'Inicio', level: 1 })).toBeVisible();
  }
});
