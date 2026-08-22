import { expect, test } from '@playwright/test';
import { IDS, stubApi } from './fixtures';

test.beforeEach(async ({ page }) => {
  await stubApi(page);
});

test('la ficha deduplica capítulos y muestra un solo idioma', async ({ page }) => {
  await page.goto(`/manga/${IDS.manga}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Obra de prueba');

  // Los datos traen el capítulo 1 dos veces: se muestra una sola. Se acota a la
  // sección: arriba está el botón de continuar, que también enlaza al lector.
  const filas = page.locator('section a[href^="/read/"]');
  await expect(filas).toHaveCount(3);
  await expect(filas.first()).toContainText('Cap. 1');
  await expect(page.locator('h2').first()).toContainText('(3)');
});

test('las obras licenciadas no aparecen en la búsqueda', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Buscar una obra…').fill('obra');
  await expect(page.locator(`a[href="/manga/${IDS.manga}"]`)).toBeVisible();
  // La licenciada sólo tiene capítulos externos: se cae de la grilla.
  await expect(page.locator(`a[href="/manga/${IDS.licenciada}"]`)).toHaveCount(0, {
    timeout: 15_000,
  });
});

test('la ficha de una obra licenciada explica por qué está vacía', async ({ page }) => {
  await page.goto(`/manga/${IDS.licenciada}`);
  // El título de la obra y el del estado vacío dicen lo mismo: se afirma sobre
  // la explicación, que es única.
  await expect(page.getByText('MangaDex no aloja las páginas')).toBeVisible();
  await expect(page.getByRole('link', { name: /lector oficial/ })).toBeVisible();
});

test('marcar leído a mano se refleja en la fila', async ({ page }) => {
  await page.goto(`/manga/${IDS.manga}`);
  const check = page.locator('section a[href^="/read/"] button[aria-label*="leído"]').first();
  await expect(check).toHaveAttribute('aria-pressed', 'false');
  await check.click();
  await expect(check).toHaveAttribute('aria-pressed', 'true');
  await check.click();
  await expect(check).toHaveAttribute('aria-pressed', 'false');
});

test('la ficha propone el capítulo que toca y destaca su fila', async ({ page }) => {
  await page.goto(`/manga/${IDS.manga}`);

  // Sin nada leído propone el primero; la lista no se destaca todavía.
  await expect(page.getByRole('link', { name: /Empezar por Cap. 1/ })).toBeVisible();

  // Al marcar el primero como leído, el botón pasa al siguiente y esa fila queda
  // resaltada: es lo que evita tener que buscarla a mano.
  await page.locator('section a[href^="/read/"] button[aria-label*="leído"]').first().click();
  const continuar = page.getByRole('link', { name: /Leer Cap. 2/ });
  await expect(continuar).toBeVisible();
  await expect(page.locator('section a[href^="/read/"]').nth(1)).toHaveClass(/ring-accent/);

  await continuar.click();
  await expect(page).toHaveURL(/\/read\/cap-2$/);
});
