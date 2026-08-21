import { expect, test } from '@playwright/test';
import { IDS, stubApi } from './fixtures';

test.beforeEach(async ({ page }) => {
  await stubApi(page);
});

test('la ficha deduplica capítulos y muestra un solo idioma', async ({ page }) => {
  await page.goto(`/manga/${IDS.manga}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Obra de prueba');

  // Los datos traen el capítulo 1 dos veces: se muestra una sola.
  const filas = page.locator('a[href^="/read/"]');
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
  const check = page.locator('a[href^="/read/"] button[aria-label*="leído"]').first();
  await expect(check).toHaveAttribute('aria-pressed', 'false');
  await check.click();
  await expect(check).toHaveAttribute('aria-pressed', 'true');
  await check.click();
  await expect(check).toHaveAttribute('aria-pressed', 'false');
});
