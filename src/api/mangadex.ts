import { UPLOADS_ORIGIN, apiGet, getAtHomeServer, imageUrl } from './client';
import type {
  Chapter,
  CollectionResponse,
  EntityResponse,
  ImageQuality,
  LocalizedString,
  Manga,
  Relationship,
  Tag,
} from './types';

/** Idiomas de capítulo que la app pide, en orden de preferencia. */
export const TRANSLATED_LANGUAGES = ['es', 'es-la', 'en'] as const;

/** Ratings incluidos: la app es de uso personal y no muestra contenido adulto. */
const CONTENT_RATING = ['safe', 'suggestive'];

const FEED_PAGE_SIZE = 500;
/** Tope duro de la API: `offset + limit` no puede pasar de 10000. */
const MAX_FEED_OFFSET = 10_000;

export async function searchManga(
  title: string,
  signal?: AbortSignal,
  limit = 20,
): Promise<Manga[]> {
  const body = await apiGet<CollectionResponse<Manga>>(
    '/manga',
    {
      title,
      limit,
      includes: ['cover_art'],
      contentRating: CONTENT_RATING,
    },
    signal,
  );
  return body.data;
}

export async function getManga(id: string, signal?: AbortSignal): Promise<Manga> {
  const body = await apiGet<EntityResponse<Manga>>(
    `/manga/${id}`,
    { includes: ['cover_art', 'author'] },
    signal,
  );
  return body.data;
}

/**
 * Trae el feed completo de capítulos. La API pagina de a 500 como máximo, así
 * que se recorre hasta juntar `total` (o hasta el tope de offset de la API).
 */
export async function getChapterFeed(
  mangaId: string,
  signal?: AbortSignal,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Chapter[]> {
  const chapters: Chapter[] = [];
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total && offset < MAX_FEED_OFFSET) {
    const body = await apiGet<CollectionResponse<Chapter>>(
      `/manga/${mangaId}/feed`,
      {
        translatedLanguage: [...TRANSLATED_LANGUAGES],
        contentRating: CONTENT_RATING,
        // Las obras licenciadas sólo enlazan al lector oficial: no se pueden
        // leer ni descargar acá, así que no entran en la lista.
        includeExternalUrl: 0,
        'order[chapter]': 'asc',
        limit: FEED_PAGE_SIZE,
        offset,
      },
      signal,
    );

    total = body.total;
    chapters.push(...body.data);
    onProgress?.(chapters.length, total);

    // Sin datos en la página no hay forma de avanzar: cortar antes de girar en falso.
    if (body.data.length === 0) break;
    offset += FEED_PAGE_SIZE;
  }

  return chapters;
}

/** Trae el capítulo con la obra embebida, para no pedir el manga por separado. */
export async function getChapter(chapterId: string, signal?: AbortSignal): Promise<Chapter> {
  const body = await apiGet<EntityResponse<Chapter>>(
    `/chapter/${chapterId}`,
    { includes: ['manga'] },
    signal,
  );
  return body.data;
}

/** Obras ya traídas en esta sesión. El lector las usa sólo por la portada. */
const mangaCache = new Map<string, Manga>();

/** Igual que `getManga` pero sin repetir el pedido al encadenar capítulos. */
export async function getCachedManga(id: string, signal?: AbortSignal): Promise<Manga> {
  const cached = mangaCache.get(id);
  if (cached) return cached;
  const manga = await getManga(id, signal);
  mangaCache.set(id, manga);
  return manga;
}

/** Feeds ya traídos en esta sesión, para no repetir el paginado al encadenar capítulos. */
const feedCache = new Map<string, Chapter[]>();

/** Igual que `getChapterFeed` pero reusando lo que ya se pidió en esta sesión. */
export async function getCachedChapterFeed(
  mangaId: string,
  signal?: AbortSignal,
): Promise<Chapter[]> {
  const cached = feedCache.get(mangaId);
  if (cached) return cached;
  const chapters = await getChapterFeed(mangaId, signal);
  feedCache.set(mangaId, chapters);
  return chapters;
}

/** Relación `manga` del capítulo, con atributos si se pidió `includes[]=manga`. */
export function chapterManga(
  chapter: Chapter,
): Extract<Relationship, { type: 'manga' }> | undefined {
  return chapter.relationships.find(
    (relationship): relationship is Extract<Relationship, { type: 'manga' }> =>
      relationship.type === 'manga',
  );
}

/** Obras por id, en un solo pedido. El orden de salida respeta el de `ids`. */
export async function getMangaByIds(ids: string[], signal?: AbortSignal): Promise<Manga[]> {
  if (ids.length === 0) return [];
  const body = await apiGet<CollectionResponse<Manga>>(
    '/manga',
    { ids, limit: ids.length, includes: ['cover_art'], contentRating: CONTENT_RATING },
    signal,
  );
  const byId = new Map(body.data.map((manga) => [manga.id, manga]));
  return ids.map((id) => byId.get(id)).filter((manga): manga is Manga => manga !== undefined);
}

/**
 * Obras con capítulos subidos hace poco.
 *
 * Se parte de los capítulos y no de las obras: el listado de capítulos ya se
 * puede filtrar a lo leíble y a los idiomas configurados, así que lo que sale de
 * acá no necesita comprobarse una por una.
 */
export async function getRecentlyUpdated(signal?: AbortSignal, limit = 24): Promise<Manga[]> {
  const body = await apiGet<CollectionResponse<Chapter>>(
    '/chapter',
    {
      includeExternalUrl: 0,
      translatedLanguage: [...TRANSLATED_LANGUAGES],
      contentRating: CONTENT_RATING,
      'order[readableAt]': 'desc',
      limit: 100,
      includes: ['manga'],
    },
    signal,
  );

  const ids: string[] = [];
  for (const chapter of body.data) {
    const id = chapterManga(chapter)?.id;
    if (id && !ids.includes(id)) ids.push(id);
    if (ids.length >= limit) break;
  }
  return getMangaByIds(ids, signal);
}

/** Obras más seguidas. Hay que filtrarlas después: muchas son licenciadas. */
export async function getPopular(signal?: AbortSignal, limit = 24): Promise<Manga[]> {
  const body = await apiGet<CollectionResponse<Manga>>(
    '/manga',
    {
      'order[followedCount]': 'desc',
      hasAvailableChapters: true,
      availableTranslatedLanguage: [...TRANSLATED_LANGUAGES],
      contentRating: CONTENT_RATING,
      includes: ['cover_art'],
      limit,
    },
    signal,
  );
  return body.data;
}

/** Obras de un género, ordenadas por seguidores. También hay que filtrarlas. */
export async function getByTag(
  tagId: string,
  signal?: AbortSignal,
  limit = 24,
): Promise<Manga[]> {
  const body = await apiGet<CollectionResponse<Manga>>(
    '/manga',
    {
      includedTags: [tagId],
      'order[followedCount]': 'desc',
      hasAvailableChapters: true,
      availableTranslatedLanguage: [...TRANSLATED_LANGUAGES],
      contentRating: CONTENT_RATING,
      includes: ['cover_art'],
      limit,
    },
    signal,
  );
  return body.data;
}

/** Lista de géneros. Es fija, así que se pide una sola vez por sesión. */
let genresCache: Tag[] | null = null;

export async function getGenres(signal?: AbortSignal): Promise<Tag[]> {
  if (genresCache) return genresCache;
  const body = await apiGet<CollectionResponse<Tag>>('/manga/tag', {}, signal);
  genresCache = body.data
    .filter((tag) => tag.attributes.group === 'genre')
    .sort((a, b) => pickLocalized(a.attributes.name).localeCompare(pickLocalized(b.attributes.name)));
  return genresCache;
}

/** Resultado por obra de si tiene algo leíble; se cachea por sesión. */
const readableCache = new Map<string, boolean>();

/**
 * Si la obra tiene al menos un capítulo que la app pueda abrir.
 *
 * Pide una sola fila del feed ya filtrado y mira el `total`, así que es barato
 * comparado con traerse el feed entero.
 */
export async function hasReadableChapters(
  mangaId: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const cached = readableCache.get(mangaId);
  if (cached !== undefined) return cached;

  const body = await apiGet<CollectionResponse<Chapter>>(
    `/manga/${mangaId}/feed`,
    {
      translatedLanguage: [...TRANSLATED_LANGUAGES],
      contentRating: CONTENT_RATING,
      includeExternalUrl: 0,
      limit: 1,
    },
    signal,
  );
  const readable = body.total > 0;
  readableCache.set(mangaId, readable);
  return readable;
}

/**
 * Enlace al lector oficial, si la obra sólo existe como capítulos externos.
 * Sirve para explicar una ficha vacía en vez de dejarla sin motivo.
 */
export async function officialReaderUrl(
  mangaId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const body = await apiGet<CollectionResponse<Chapter>>(
    `/manga/${mangaId}/feed`,
    {
      translatedLanguage: [...TRANSLATED_LANGUAGES],
      contentRating: CONTENT_RATING,
      limit: 1,
      'order[chapter]': 'asc',
    },
    signal,
  );
  return body.data[0]?.attributes.externalUrl ?? null;
}

/** URLs de todas las páginas de un capítulo, en la calidad pedida. */
export async function getChapterPageUrls(
  chapterId: string,
  quality: ImageQuality = 'data',
  signal?: AbortSignal,
): Promise<string[]> {
  const atHome = await getAtHomeServer(chapterId, signal);
  const files = quality === 'data' ? atHome.chapter.data : atHome.chapter.dataSaver;
  return files.map((file) =>
    imageUrl(`${atHome.baseUrl}/${quality}/${atHome.chapter.hash}/${file}`),
  );
}

// --- Helpers de presentación ---

/** Texto en el idioma más cercano al del usuario, con el primero como último recurso. */
export function pickLocalized(text: LocalizedString, fallback = ''): string {
  for (const lang of ['es', 'es-la', 'en', 'ja-ro', 'ja']) {
    const value = text[lang];
    if (value) return value;
  }
  const first = Object.values(text)[0];
  return first ?? fallback;
}

export function mangaTitle(manga: Manga): string {
  return pickLocalized(manga.attributes.title, 'Sin título');
}

export function mangaDescription(manga: Manga): string {
  return pickLocalized(manga.attributes.description);
}

function findRelationship<T extends Relationship['type']>(
  relationships: Relationship[],
  type: T,
): Extract<Relationship, { type: T }> | undefined {
  return relationships.find(
    (relationship): relationship is Extract<Relationship, { type: T }> =>
      relationship.type === type,
  );
}

/** Portada en `.256.jpg` / `.512.jpg`, o `null` si el manga vino sin `cover_art`. */
export function coverUrl(manga: Manga, size: 256 | 512 = 512): string | null {
  const cover = findRelationship(manga.relationships, 'cover_art');
  const fileName = cover?.attributes?.fileName;
  if (!fileName) return null;
  return imageUrl(`${UPLOADS_ORIGIN}/covers/${manga.id}/${fileName}.${size}.jpg`);
}

export function authorNames(manga: Manga): string[] {
  const names = manga.relationships
    .filter(
      (relationship): relationship is Extract<Relationship, { type: 'author' | 'artist' }> =>
        relationship.type === 'author' || relationship.type === 'artist',
    )
    .map((relationship) => relationship.attributes?.name)
    .filter((name): name is string => Boolean(name));
  return [...new Set(names)];
}

export function tagNames(manga: Manga): string[] {
  return manga.attributes.tags.map((tag) => pickLocalized(tag.attributes.name)).filter(Boolean);
}

/** Etiqueta corta del capítulo para listas y barra del lector. */
export function chapterLabel(chapter: Chapter): string {
  const { chapter: number, title } = chapter.attributes;
  const head = number ? `Cap. ${number}` : 'Oneshot';
  return title ? `${head} — ${title}` : head;
}

/** Clave de agrupación por volumen; los sueltos caen en "Sin volumen". */
export function volumeLabel(chapter: Chapter): string {
  const volume = chapter.attributes.volume;
  return volume ? `Volumen ${volume}` : 'Sin volumen';
}

/** Idiomas en orden de preferencia: el español manda, el inglés es el último recurso. */
const LANGUAGE_PREFERENCE = ['es', 'es-la', 'en'];

/** Capítulos agrupados por idioma, de más traducido a menos. */
export function chaptersByLanguage(chapters: Chapter[]): Map<string, Chapter[]> {
  const groups = new Map<string, Chapter[]>();
  for (const chapter of chapters) {
    const language = chapter.attributes.translatedLanguage;
    const group = groups.get(language);
    if (group) group.push(chapter);
    else groups.set(language, [chapter]);
  }
  return new Map(
    [...groups.entries()].sort((a, b) => {
      const byPreference =
        LANGUAGE_PREFERENCE.indexOf(a[0]) - LANGUAGE_PREFERENCE.indexOf(b[0]);
      // Entre dos variantes del español gana la que tenga más capítulos: leer de
      // corrido importa más que la variante concreta.
      if (a[0].startsWith('es') && b[0].startsWith('es')) return b[1].length - a[1].length;
      return byPreference;
    }),
  );
}

/** Idioma con el que conviene abrir una obra. */
export function preferredLanguage(chapters: Chapter[]): string | null {
  return [...chaptersByLanguage(chapters).keys()][0] ?? null;
}

/**
 * Deja una sola versión de cada capítulo.
 *
 * Varios grupos de scanlation suben el mismo número, así que sin esto la lista
 * repite el capítulo 1 cinco veces y el encadenado del lector salta de una
 * versión a otra en vez de avanzar. Se queda la más completa, y a igual cantidad
 * de páginas, la publicada primero.
 */
export function dedupeChapters(chapters: Chapter[]): Chapter[] {
  const best = new Map<string, Chapter>();
  for (const chapter of chapters) {
    // Los oneshots no tienen número: cada uno es su propia entrada.
    const key = chapter.attributes.chapter ?? `id:${chapter.id}`;
    const current = best.get(key);
    if (!current) {
      best.set(key, chapter);
      continue;
    }
    const morePages = chapter.attributes.pages > current.attributes.pages;
    const samePages = chapter.attributes.pages === current.attributes.pages;
    const earlier = chapter.attributes.publishAt < current.attributes.publishAt;
    if (morePages || (samePages && earlier)) best.set(key, chapter);
  }
  return [...best.values()];
}

/** Un capítulo alojado afuera o marcado como no disponible no se puede leer. */
export function isReadable(chapter: Chapter): boolean {
  return (
    chapter.attributes.externalUrl === null &&
    chapter.attributes.isUnavailable !== true &&
    chapter.attributes.pages > 0
  );
}
