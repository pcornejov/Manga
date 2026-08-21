import { expect, test } from '@playwright/test';
import { stubApi } from './fixtures';

test.beforeEach(async ({ page }) => {
  await stubApi(page);
});

/** Despierta las barras del lector, que se ocultan solas. */
async function mostrarBarras(page: import('@playwright/test').Page): Promise<void> {
  await page.mouse.move(195, 400);
  await page.mouse.move(196, 401);
}

test('abre en modo continuo y anuncia la página', async ({ page }) => {
  await page.goto('/read/cap-1');
  await expect(page.getByAltText('Página 1')).toBeVisible();
  await mostrarBarras(page);

  await expect(page.locator('footer button[aria-pressed=true]').first()).toHaveText('Continuo');
  await expect(page.locator('[aria-live=polite]')).toHaveText('Página 1 de 4');
});

test('los tres modos pasan de página', async ({ page }) => {
  await page.goto('/read/cap-1');
  await expect(page.getByAltText('Página 1')).toBeVisible();
  await mostrarBarras(page);

  // RTL: la flecha izquierda avanza.
  await page.locator('footer button', { hasText: 'RTL' }).click();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('footer span').first()).toHaveText('2 / 4');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('footer span').first()).toHaveText('1 / 4');

  // LTR: al revés.
  await mostrarBarras(page);
  await page.locator('footer button', { hasText: 'LTR' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('footer span').first()).toHaveText('2 / 4');

  // Continuo: scrollea.
  await mostrarBarras(page);
  await page.locator('footer button', { hasText: 'Continuo' }).click();
  await expect(page.locator('div.overflow-auto')).toBeVisible();
});

test('nunca hay más de tres imágenes en vuelo', async ({ page }) => {
  let enVuelo = 0;
  let pico = 0;
  await page.route('**/img*', async (route) => {
    enVuelo += 1;
    pico = Math.max(pico, enVuelo);
    await new Promise((r) => setTimeout(r, 60));
    enVuelo -= 1;
    await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) });
  });

  await page.goto('/read/cap-1');
  await mostrarBarras(page);
  await page.waitForTimeout(2500);
  expect(pico).toBeLessThanOrEqual(3);
});

test('el botón de siguiente lleva al capítulo siguiente, no a otra versión', async ({ page }) => {
  await page.goto('/read/cap-1');
  await expect(page.getByAltText('Página 1')).toBeVisible();
  await mostrarBarras(page);

  await page.locator('footer input[type=range]').fill('3');
  const siguiente = page.getByRole('button', { name: /Siguiente/ });
  await expect(siguiente).toContainText('Cap. 2');
  await siguiente.click();
  await expect(page.locator('header p').nth(1)).toContainText('Cap. 2');
});
