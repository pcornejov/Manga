// Tipos de las respuestas de la API de MangaDex (https://api.mangadex.org).
// Sólo se modela lo que la app consume; los campos que no usamos quedan fuera a propósito.

/** Mapa idioma → texto. Con `noUncheckedIndexedAccess` el acceso ya devuelve `string | undefined`. */
export type LocalizedString = Record<string, string>;

export interface CollectionResponse<T> {
  result: 'ok';
  response: 'collection';
  data: T[];
  limit: number;
  offset: number;
  total: number;
}

export interface EntityResponse<T> {
  result: 'ok';
  response: 'entity';
  data: T;
}

export interface ErrorResponse {
  result: 'error';
  errors: Array<{
    id: string;
    status: number;
    title: string;
    detail: string | null;
  }>;
}

// --- Relaciones ---

export interface CoverArtAttributes {
  fileName: string;
  volume: string | null;
  locale: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface AuthorAttributes {
  name: string;
  imageUrl: string | null;
  biography: LocalizedString;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface ScanlationGroupAttributes {
  name: string;
  website: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * Unión discriminada por `type`. Las `attributes` sólo vienen si se pidió el
 * `includes[]` correspondiente, de ahí que sean opcionales.
 */
export type Relationship =
  | { id: string; type: 'cover_art'; attributes?: CoverArtAttributes }
  | { id: string; type: 'author'; attributes?: AuthorAttributes }
  | { id: string; type: 'artist'; attributes?: AuthorAttributes }
  | { id: string; type: 'scanlation_group'; attributes?: ScanlationGroupAttributes }
  | { id: string; type: 'manga'; attributes?: MangaAttributes }
  | { id: string; type: 'user' | 'creator' | 'leader' | 'member'; attributes?: undefined };

// --- Manga ---

export type ContentRating = 'safe' | 'suggestive' | 'erotica' | 'pornographic';
export type MangaStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
export type Demographic = 'shounen' | 'shoujo' | 'josei' | 'seinen' | 'none';

export interface Tag {
  id: string;
  type: 'tag';
  attributes: {
    name: LocalizedString;
    description: LocalizedString;
    group: 'content' | 'format' | 'genre' | 'theme';
    version: number;
  };
}

export interface MangaAttributes {
  title: LocalizedString;
  altTitles: LocalizedString[];
  description: LocalizedString;
  originalLanguage: string;
  lastVolume: string | null;
  lastChapter: string | null;
  publicationDemographic: Demographic | null;
  status: MangaStatus;
  year: number | null;
  contentRating: ContentRating;
  tags: Tag[];
  availableTranslatedLanguages: Array<string | null>;
  /** Id del capítulo subido más recientemente, en cualquier idioma. */
  latestUploadedChapter: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface Manga {
  id: string;
  type: 'manga';
  attributes: MangaAttributes;
  relationships: Relationship[];
}

// --- Capítulos ---

export interface ChapterAttributes {
  volume: string | null;
  chapter: string | null;
  title: string | null;
  translatedLanguage: string;
  /** Capítulos alojados fuera de MangaDex: no se pueden leer en la app. */
  externalUrl: string | null;
  isUnavailable?: boolean;
  publishAt: string;
  readableAt: string;
  createdAt: string;
  updatedAt: string;
  pages: number;
  version: number;
}

export interface Chapter {
  id: string;
  type: 'chapter';
  attributes: ChapterAttributes;
  relationships: Relationship[];
}

// --- MangaDex@Home ---

export interface AtHomeResponse {
  result: 'ok';
  /** Host del nodo asignado. Expira a los 15 minutos. */
  baseUrl: string;
  chapter: {
    hash: string;
    /** Nombres de archivo en calidad original. */
    data: string[];
    /** Nombres de archivo en calidad comprimida (JPEG). */
    dataSaver: string[];
  };
}

export type ImageQuality = 'data' | 'data-saver';

// --- Estadísticas ---

export interface MangaStatistics {
  /** Puntuación de 1 a 10. `bayesian` corrige las obras con pocos votos. */
  rating: { average: number | null; bayesian: number | null };
  follows: number;
  comments: { threadId: number; repliesCount: number } | null;
}

export interface StatisticsResponse {
  result: 'ok';
  statistics: Record<string, MangaStatistics>;
}
