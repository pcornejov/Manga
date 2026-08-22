import { expect, test } from '@playwright/test';
import { IDS, stubApi } from './fixtures';

test.beforeEach(async ({ page }) => {
  await stubApi(page);
});

test('el progreso sobrevive a recargar y vuelve a la página exacta', async ({ page }) => {
  await page.goto('/read/cap-1');
  await expect(page.getByAltText('Página 1')).toBeVisible();
  await page.mouse.move(195, 400);
  await page.mouse.move(196, 401);

  await page.locator('footer button', { hasText: 'RTL' }).click();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('footer span').first()).toHaveText('3 / 4');

  // El guardado va con throttle: hay que darle su segundo.
  await page.waitForTimeout(1500);

  await page.goto('/biblioteca');
  const tarjeta = page.locator('a[href="/read/cap-1"]').first();
  await expect(tarjeta).toContainText('3/4');

  await tarjeta.click();
  // Hay que esperar a que el lector cargue antes de despertar las barras: si no,
  // el movimiento del mouse ocurre cuando todavía no hay barras que mostrar.
  await expect(page.getByAltText(/^Página/).first()).toBeVisible({ timeout: 30_000 });
  await page.mouse.move(195, 400);
  await page.mouse.move(196, 401);
  await expect(page.locator('footer span').first()).toHaveText('3 / 4');
});

test('la navegación inferior está en todas las pantallas menos el lector', async ({ page }) => {
  for (const ruta of ['/', '/biblioteca', '/almacenamiento', '/ajustes']) {
    await page.goto(ruta);
    await expect(page.locator('nav a')).toHaveCount(3);
  }
  await page.goto('/read/cap-1');
  await expect(page.locator('nav')).toHaveCount(0);
});

test('los ajustes de idioma se guardan', async ({ page }) => {
  await page.goto('/ajustes');
  const portugues = page.getByRole('button', { name: /Portugués/ });
  await expect(portugues).toHaveAttribute('aria-pressed', 'false');
  await portugues.click();
  await expect(portugues).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(page.getByRole('button', { name: /Portugués/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('se puede quitar una obra de la biblioteca', async ({ page }) => {
  // Deja una lectura a medias y sigue la obra, para tener algo en las dos listas.
  await page.goto('/read/cap-1');
  await expect(page.getByAltText('Página 1')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.goto(`/manga/${IDS.manga}`);
  await page.getByRole('button', { name: 'Seguir' }).click();

  await page.goto('/biblioteca');
  const fila = page.locator('a[href="/read/cap-1"]').first();
  await expect(fila).toBeVisible();

  // Hace falta tocar dos veces: el primer toque arma el botón.
  const quitar = fila.getByRole('button', { name: /Quitar/ });
  await quitar.click();
  await quitar.click();
  await expect(page.locator('a[href="/read/cap-1"]')).toHaveCount(0);

  const dejarDeSeguir = page.getByRole('button', { name: /Dejar de seguir/ });
  await dejarDeSeguir.click();
  await dejarDeSeguir.click();
  await expect(page.locator(`a[href="/manga/${IDS.manga}"]`)).toHaveCount(0);

  // Y no vuelven al recargar: el borrado quedó en IndexedDB.
  await page.reload();
  await expect(page.getByText('Todavía no hay nada acá')).toBeVisible();
});

