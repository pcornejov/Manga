import type { Page, Route } from '@playwright/test';

/**
 * Respuestas de MangaDex fabricadas.
 *
 * Los tests corren contra datos fijos y no contra la API real: así no dependen
 * de la red ni de que una obra siga teniendo los mismos capítulos. El contrato
 * real lo verifica `npm run smoke:api`.
 */

const MANGA_ID = '11111111-1111-1111-1111-111111111111';
const OTRO_ID = '22222222-2222-2222-2222-222222222222';

export const IDS = { manga: MANGA_ID, licenciada: OTRO_ID };

function manga(id: string, titulo: string) {
  return {
    id,
    type: 'manga',
    attributes: {
      title: { es: titulo },
      altTitles: [],
      description: { es: 'Una obra de prueba.' },
      originalLanguage: 'ja',
      lastVolume: null,
      lastChapter: null,
      publicationDemographic: 'shounen',
      status: 'ongoing',
      year: 2020,
      contentRating: 'safe',
      tags: [],
      availableTranslatedLanguages: ['es'],
      latestUploadedChapter: 'cap-3',
      createdAt: '',
      updatedAt: '',
      version: 1,
    },
    relationships: [{ id: 'cover-1', type: 'cover_art', attributes: { fileName: 'portada.jpg' } }],
  };
}

function capitulo(numero: string, id: string, paginas: number, externo = false) {
  return {
    id,
    type: 'chapter',
    attributes: {
      volume: '1',
      chapter: numero,
      title: `Capítulo ${numero}`,
      translatedLanguage: 'es',
      externalUrl: externo ? 'https://ejemplo.com/oficial' : null,
      isUnavailable: false,
      publishAt: '2024-01-01T00:00:00+00:00',
      readableAt: '2024-01-01T00:00:00+00:00',
      createdAt: '2024-01-01T00:00:00+00:00',
      updatedAt: '2024-01-01T00:00:00+00:00',
      pages: paginas,
      version: 1,
    },
    relationships: [{ id: MANGA_ID, type: 'manga' }],
  };
}

/** Capítulo 1 duplicado a propósito: es lo que la app tiene que deduplicar. */
const CAPITULOS = [
  capitulo('1', 'cap-1', 4),
  capitulo('1', 'cap-1-bis', 3),
  capitulo('2', 'cap-2', 3),
  capitulo('3', 'cap-3', 2),
];

/** PNG de 1x1 gris: alcanza para comprobar que la página se pintó. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });

/** Intercepta el proxy propio y responde con los datos de prueba. */
export async function stubApi(page: Page): Promise<void> {
  await page.route('**/img*', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  );

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const ruta = url.pathname.replace('/api', '');

    if (ruta === '/manga/tag') return json(route, { result: 'ok', response: 'collection', data: [], limit: 0, offset: 0, total: 0 });

    if (ruta.startsWith('/at-home/server/')) {
      const id = ruta.split('/').pop() ?? '';
      const paginas = CAPITULOS.find((c) => c.id === id)?.attributes.pages ?? 2;
      return json(route, {
        result: 'ok',
        baseUrl: 'https://nodo.mangadex.network',
        chapter: {
          hash: 'hash',
          data: Array.from({ length: paginas }, (_, i) => `${i + 1}.png`),
          dataSaver: Array.from({ length: paginas }, (_, i) => `s${i + 1}.jpg`),
        },
      });
    }

    if (ruta.startsWith('/chapter/')) {
      const id = ruta.split('/').pop() ?? '';
      const encontrado = CAPITULOS.find((c) => c.id === id) ?? CAPITULOS[0];
      return json(route, {
        result: 'ok',
        response: 'entity',
        data: {
          ...encontrado,
          relationships: [{ id: MANGA_ID, type: 'manga', attributes: manga(MANGA_ID, 'Obra de prueba').attributes }],
        },
      });
    }

    if (ruta.endsWith('/feed')) {
      const licenciada = ruta.includes(OTRO_ID);
      const externos = url.searchParams.get('includeExternalUrl') === '0';
      const datos = licenciada ? (externos ? [] : [capitulo('1', 'ext-1', 0, true)]) : CAPITULOS;
      return json(route, { result: 'ok', response: 'collection', data: datos, limit: 500, offset: 0, total: datos.length });
    }

    if (ruta.startsWith('/manga/')) {
      const id = ruta.split('/')[2] ?? MANGA_ID;
      return json(route, { result: 'ok', response: 'entity', data: manga(id, id === OTRO_ID ? 'Obra licenciada' : 'Obra de prueba') });
    }

    if (ruta === '/statistics/manga') {
      return json(route, {
        result: 'ok',
        statistics: { [MANGA_ID]: { rating: { average: 9, bayesian: 8.8 }, follows: 1234, comments: null } },
      });
    }

    if (ruta === '/manga') {
      const data = [manga(MANGA_ID, 'Obra de prueba'), manga(OTRO_ID, 'Obra licenciada')];
      return json(route, { result: 'ok', response: 'collection', data, limit: 20, offset: 0, total: data.length });
    }

    return json(route, { result: 'ok', response: 'collection', data: [], limit: 0, offset: 0, total: 0 });
  });
}
