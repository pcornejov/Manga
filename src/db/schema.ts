import type { DBSchema } from 'idb';

/** Modo de lectura. `rtl` es el default: la mayoría del catálogo es manga japonés. */
export type ReadingMode = 'rtl' | 'ltr' | 'vertical';

/** Cómo se ajusta la página al viewport. */
export type FitMode = 'width' | 'height' | 'original';

export interface LibraryEntry {
  mangaId: string;
  title: string;
  coverUrl: string | null;
  addedAt: number;
  /**
   * Estado de la obra la última vez que se abrió su ficha. Comparar contra el
   * actual es lo que permite avisar de capítulos nuevos sin traerse el feed.
   * Opcionales: las entradas guardadas antes de existir estos campos no los traen.
   */
  latestChapterId?: string | null;
  chapterCount?: number;
}

/**
 * Una fila por capítulo abierto. Sirve para dos cosas: reanudar en la página
 * exacta y saber qué capítulos ya se leyeron.
 */
export interface ProgressEntry {
  chapterId: string;
  mangaId: string;
  /** Copia del título y la portada: "Continuar leyendo" se pinta sin red. */
  mangaTitle: string;
  coverUrl: string | null;
  /** Índice de página, base 0. */
  page: number;
  totalPages: number;
  /** Se marca al llegar a la última página. */
  completed: boolean;
  /** Etiqueta del capítulo, para no tener que volver a pedir el feed. */
  chapterLabel: string;
  updatedAt: number;
}

export interface GlobalSettings {
  key: 'global';
  readingMode: ReadingMode;
  fitMode: FitMode;
}

export interface MangaSettings {
  key: string;
  readingMode: ReadingMode;
  fitMode: FitMode;
}

export type SettingsEntry = GlobalSettings | MangaSettings;

/** Un capítulo descargado para leer sin conexión. */
export interface DownloadEntry {
  chapterId: string;
  mangaId: string;
  /** Copia del título: sin conexión no se puede pedir la obra. */
  mangaTitle: string;
  chapterLabel: string;
  urls: string[];
  bytes: number;
  downloadedAt: number;
}

export interface MangaReaderDB extends DBSchema {
  library: {
    key: string;
    value: LibraryEntry;
    indexes: { 'by-addedAt': number };
  };
  progress: {
    key: string;
    value: ProgressEntry;
    indexes: { 'by-manga': string; 'by-updatedAt': number };
  };
  settings: {
    key: string;
    value: SettingsEntry;
  };
  downloads: {
    key: string;
    value: DownloadEntry;
    indexes: { 'by-manga': string };
  };
}

export const DB_NAME = 'manga-reader';
export const DB_VERSION = 1;
