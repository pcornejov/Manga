import { UPLOADS_BASE, apiGet, getAtHomeServer } from './client';
import type {
  Chapter,
  CollectionResponse,
  EntityResponse,
  ImageQuality,
  LocalizedString,
  Manga,
  Relationship,
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

/** URLs de todas las páginas de un capítulo, en la calidad pedida. */
export async function getChapterPageUrls(
  chapterId: string,
  quality: ImageQuality = 'data',
  signal?: AbortSignal,
): Promise<string[]> {
  const atHome = await getAtHomeServer(chapterId, signal);
  const files = quality === 'data' ? atHome.chapter.data : atHome.chapter.dataSaver;
  return files.map((file) => `${atHome.baseUrl}/${quality}/${atHome.chapter.hash}/${file}`);
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
  return `${UPLOADS_BASE}/covers/${manga.id}/${fileName}.${size}.jpg`;
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

/** Un capítulo alojado afuera o marcado como no disponible no se puede leer. */
export function isReadable(chapter: Chapter): boolean {
  return (
    chapter.attributes.externalUrl === null &&
    chapter.attributes.isUnavailable !== true &&
    chapter.attributes.pages > 0
  );
}
