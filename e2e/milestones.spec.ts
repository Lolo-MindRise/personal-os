import { expect, test, type Page } from '@playwright/test';

// Milestones screen in production mode, on the seeded temporary database (fresh per run). The seed
// has "Revisar el presupuesto" (2026-02-15, done) and "Liquidar el préstamo" (2027-09-30,
// in progress). The test adds milestones with dates far in the past or future, so the result does
// not depend on the day the suite runs. Milestones cannot be deleted; nothing else reads them.

const nav = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Secciones' }).getByRole('button', { name });
const row = (page: Page, title: string) =>
  page.locator('table.milestones tbody tr').filter({ hasText: title });

test('add milestones, see them ordered by date, and an overdue one stand out until it is done', async ({
  page,
}) => {
  await page.goto('/');
  await nav(page, 'Hitos').click();
  await expect(page.getByRole('heading', { name: 'Hitos', level: 1 })).toBeVisible();
  await expect(row(page, 'Revisar el presupuesto')).toContainText('Hecho');

  await test.step('add one in the past and one in the far future', async () => {
    await page.getByLabel('Título').fill('hito atrasado de prueba');
    await page.getByLabel('Fecha objetivo').fill('2020-01-15');
    await page.getByRole('button', { name: 'Añadir', exact: true }).click();
    await expect(row(page, 'hito atrasado de prueba')).toHaveCount(1);

    await page.getByLabel('Título').fill('hito lejano de prueba');
    await page.getByLabel('Fecha objetivo').fill('2099-06-30');
    await page.getByLabel('Estado').selectOption({ label: 'En curso' });
    await page.getByRole('button', { name: 'Añadir', exact: true }).click();
    await expect(row(page, 'hito lejano de prueba')).toContainText('En curso');
  });

  await test.step('ordered by target date', async () => {
    const titles = await page.locator('table.milestones tbody tr td:nth-child(2)').allInnerTexts();
    const order = [
      'hito atrasado de prueba',
      'Revisar el presupuesto',
      'Liquidar el préstamo',
      'hito lejano de prueba',
    ];
    const positions = order.map((t) => titles.findIndex((text) => text.includes(t)));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  await test.step('only the overdue, not-done one is highlighted', async () => {
    const late = row(page, 'hito atrasado de prueba');
    await expect(late).toHaveClass(/overdue-row/);
    await expect(late).toContainText('Vencido');
    await expect(row(page, 'Revisar el presupuesto')).not.toHaveClass(/overdue-row/); // done
    await expect(row(page, 'hito lejano de prueba')).not.toHaveClass(/overdue-row/); // future
  });

  await test.step('marking it done removes the highlight', async () => {
    await row(page, 'hito atrasado de prueba').getByRole('button', { name: 'Editar' }).click();
    await page.getByLabel('Estado').selectOption({ label: 'Hecho' });
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    const late = row(page, 'hito atrasado de prueba');
    await expect(late).toContainText('Hecho');
    await expect(late).not.toHaveClass(/overdue-row/);
    await expect(late).not.toContainText('Vencido');
  });

  await test.step('an empty title is refused next to the field', async () => {
    await page.getByLabel('Fecha objetivo').fill('2099-01-01');
    await page.getByRole('button', { name: 'Añadir', exact: true }).click();
    await expect(page.getByText('Escribe un título.')).toBeVisible();
  });
});
