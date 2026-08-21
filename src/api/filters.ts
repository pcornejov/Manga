import { getSettings, saveSettings } from '../db';
import type { CatalogFilters } from '../db/schema';

/** Idiomas disponibles, con su nombre para la pantalla de ajustes. */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'es', label: 'Español' },
  { code: 'es-la', label: 'Español latino' },
  { code: 'en', label: 'Inglés' },
  { code: 'pt-br', label: 'Portugués (Brasil)' },
  { code: 'fr', label: 'Francés' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Alemán' },
  { code: 'ru', label: 'Ruso' },
];

export const RATING_OPTIONS: ReadonlyArray<{ code: string; label: string; hint?: string }> = [
  { code: 'safe', label: 'Todo público' },
  { code: 'suggestive', label: 'Sugestivo' },
  { code: 'erotica', label: 'Erótico', hint: 'Suma unas 5.400 obras' },
];

const DEFAULTS: Omit<CatalogFilters, 'key'> = {
  languages: ['es', 'es-la', 'en'],
  contentRating: ['safe', 'suggestive'],
};

/**
 * Filtros vigentes, en memoria.
 *
 * La capa de datos los lee de forma síncrona en cada consulta, así que se cargan
 * una vez al arrancar y se mantienen actualizados desde los ajustes.
 */
let current: Omit<CatalogFilters, 'key'> = DEFAULTS;
let loaded: Promise<void> | null = null;

export function catalogFilters(): Omit<CatalogFilters, 'key'> {
  return current;
}

/** Se llama al arrancar la app, antes de la primera consulta. */
export function loadCatalogFilters(): Promise<void> {
  loaded ??= getSettings('catalog')
    .then((stored) => {
      if (stored && 'languages' in stored) {
        current = { languages: stored.languages, contentRating: stored.contentRating };
      }
    })
    .catch(() => undefined);
  return loaded;
}

export async function saveCatalogFilters(next: Omit<CatalogFilters, 'key'>): Promise<void> {
  // Sin idiomas o sin clasificaciones no habría catálogo: se ignora el vacío.
  current = {
    languages: next.languages.length > 0 ? next.languages : DEFAULTS.languages,
    contentRating: next.contentRating.length > 0 ? next.contentRating : DEFAULTS.contentRating,
  };
  await saveSettings({ key: 'catalog', ...current });
}

export function isDefaultFilters(): boolean {
  return (
    current.languages.join() === DEFAULTS.languages.join() &&
    current.contentRating.join() === DEFAULTS.contentRating.join()
  );
}
