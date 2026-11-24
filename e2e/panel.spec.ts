import { expect, test } from '@playwright/test';

// Task 0015, block 3: the side panel. Production mode, seeded database, January 2026.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime('2026-01-15T12:00:00');
  await page.goto('/#/movements?month=2026-01');
});

test('opens with focus inside, keeps focus inside, and Esc closes and returns focus to the button', async ({
  page,
}) => {
  const open = page.getByRole('button', { name: 'Añadir movimiento' });
  await open.click();
  const panel = page.getByRole('dialog', { name: 'Añadir movimiento' });
  await expect(panel).toBeVisible();
  const focusInPanel = () =>
    page.evaluate(() => document.activeElement?.closest('.side-panel') !== null);
  await expect.poll(focusInPanel).toBe(true);

  // Tab many times: focus never leaves the panel.
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    expect(await focusInPanel()).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await focusInPanel()).toBe(true);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(open).toBeFocused();
});

test('the close button and the overlay close it too, without saving', async ({ page }) => {
  await page.getByRole('button', { name: 'Añadir movimiento' }).click();
  await page.getByLabel('Concepto').fill('no se guarda');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // Reopened, the form is empty.
  await page.getByRole('button', { name: 'Añadir movimiento' }).click();
  await expect(page.getByLabel('Concepto')).toHaveValue('');
  await page.mouse.click(10, 300);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('table.movements')).not.toContainText('no se guarda');
});

test('editing from a row returns focus to that row when it closes', async ({ page }) => {
  const edit = page.locator('table.movements tbody tr').first().getByRole('button', {
    name: 'Editar',
  });
  await edit.click();
  await expect(page.getByRole('dialog', { name: 'Editar movimiento' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test('an empty month says what is missing and offers the way to add it', async ({ page }) => {
  // Before any fixed item starts: no movements and nothing pending.
  await page.goto('/#/movements?month=2020-05');
  await expect(page.getByText('No hay movimientos este mes.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'importa un extracto' })).toBeVisible();
  await expect(page.locator('.empty').getByRole('link', { name: 'Fijos' })).toBeVisible();
});
