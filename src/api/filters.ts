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

/**
 * Las cuatro clasificaciones de MangaDex, en orden creciente.
 *
 * La diferencia entre las dos últimas está en si el sexo es la obra o le pasa a
 * la obra: en `erotica` hay desnudos y escenas dentro de una historia normal,
 * mientras que `pornographic` es hentai, con el acto como contenido principal.
 * La pista lo dice porque MangaDex no lo documenta en ningún lado.
 */
export const RATING_OPTIONS: ReadonlyArray<{ code: string; label: string; hint?: string }> = [
  { code: 'safe', label: 'Todo público' },
  { code: 'suggestive', label: 'Sugestivo', hint: 'Fanservice, sin desnudos explícitos' },
  { code: 'erotica', label: 'Erótico', hint: 'Desnudos dentro de la historia · unas 5.400 obras' },
  {
    code: 'pornographic',
    label: 'Pornográfico',
    hint: 'Hentai: el sexo es el contenido · unas 15.100 obras',
  },
];

const DEFAULTS: Omit<CatalogFilters, 'key'> = {
  languages: ['es', 'es-la', 'en'],
  contentRating: ['safe', 'suggestive', 'erotica'],
};

/**
 * Última revisión de los valores por defecto.
 *
 * Subir un default no alcanza para quien ya pasó por Ajustes: su copia guardada
 * gana siempre. La revisión dice hasta dónde se le aplicaron los cambios, para
 * que se apliquen una sola vez y no vuelvan a encender algo que se apagó a mano.
 *
 * 1 — el catálogo erótico pasa a venir activado.
 */
const REVISION = 1;

/** Deja las clasificaciones en el orden del selector, sin repetidas. */
function ordenar(codes: readonly string[]): string[] {
  const pedidas = new Set(codes);
  return RATING_OPTIONS.map((option) => option.code).filter((code) => pedidas.has(code));
}

/** Aplica sobre unos ajustes guardados los cambios de default que les falten. */
export function applyRevision(stored: Omit<CatalogFilters, 'key'>): Omit<CatalogFilters, 'key'> {
  const alDia = (stored.revision ?? 0) >= REVISION;
  return {
    languages: stored.languages,
    contentRating: alDia ? stored.contentRating : ordenar([...stored.contentRating, 'erotica']),
    revision: REVISION,
  };
}

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
      if (!stored || !('languages' in stored)) return;
      const migrado = applyRevision(stored);
      current = migrado;
      // Se reescribe sólo si algo cambió: así la revisión queda marcada y el
      // arranque siguiente no vuelve a pasar por acá.
      if (stored.revision !== REVISION) void saveSettings({ key: 'catalog', ...migrado });
    })
    .catch(() => undefined);
  return loaded;
}

export async function saveCatalogFilters(next: Omit<CatalogFilters, 'key'>): Promise<void> {
  // Sin idiomas o sin clasificaciones no habría catálogo: se ignora el vacío.
  current = {
    languages: next.languages.length > 0 ? next.languages : DEFAULTS.languages,
    contentRating: next.contentRating.length > 0 ? next.contentRating : DEFAULTS.contentRating,
    revision: REVISION,
  };
  await saveSettings({ key: 'catalog', ...current });
}

export function isDefaultFilters(): boolean {
  return (
    current.languages.join() === DEFAULTS.languages.join() &&
    current.contentRating.join() === DEFAULTS.contentRating.join()
  );
}
