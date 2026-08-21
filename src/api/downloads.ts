import { deleteDownload, getDownload, getDownloads, saveDownload } from '../db';
import type { DownloadEntry } from '../db/schema';
import { getChapterPageUrls } from './mangadex';

/**
 * Caché de páginas de capítulo.
 *
 * Es el mismo nombre que usa la estrategia `CacheFirst` del Service Worker, así
 * que lo que se descarga acá se sirve solo cuando no hay red.
 */
export const PAGES_CACHE = 'mangadex-pages';

/** Descargas en paralelo: las mismas que tolera el lector. */
const CONCURRENCY = 3;

export interface DownloadProgress {
  done: number;
  total: number;
}

function cachesAvailable(): boolean {
  return typeof caches !== 'undefined';
}

/**
 * Baja todas las páginas de un capítulo a la caché y deja constancia en
 * IndexedDB. Devuelve la entrada guardada.
 */
export async function downloadChapter(
  chapterId: string,
  mangaId: string,
  mangaTitle: string,
  chapterLabel: string,
  onProgress?: (progress: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<DownloadEntry> {
  if (!cachesAvailable()) throw new Error('Este navegador no permite guardar capítulos.');

  const urls = await getChapterPageUrls(chapterId, 'data', signal);
  if (urls.length === 0) throw new Error('El capítulo no tiene páginas.');

  const cache = await caches.open(PAGES_CACHE);
  let done = 0;
  let bytes = 0;
  onProgress?.({ done, total: urls.length });

  // Pool de tamaño fijo: cada worker toma la siguiente página libre.
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < urls.length) {
      if (signal?.aborted) throw new Error('Descarga cancelada.');
      const url = urls[cursor];
      cursor += 1;
      if (!url) continue;

      const response = await fetch(url, { signal: signal ?? null });
      if (!response.ok) throw new Error(`La página respondió ${response.status}.`);
      const body = await response.clone().blob();
      bytes += body.size;
      await cache.put(url, response);

      done += 1;
      onProgress?.({ done, total: urls.length });
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

  const entry: DownloadEntry = {
    chapterId,
    mangaId,
    mangaTitle,
    chapterLabel,
    urls,
    bytes,
    downloadedAt: Date.now(),
  };
  await saveDownload(entry);
  return entry;
}

/** Borra las páginas de un capítulo de la caché y su registro. */
export async function removeDownload(chapterId: string): Promise<void> {
  const entry = await getDownload(chapterId);
  if (entry && cachesAvailable()) {
    const cache = await caches.open(PAGES_CACHE);
    await Promise.all(entry.urls.map((url) => cache.delete(url)));
  }
  await deleteDownload(chapterId);
}

export interface StorageUsage {
  /** Suma de lo que ocupan los capítulos descargados. */
  downloadedBytes: number;
  chapters: number;
  /** Lo que el navegador dice que usa el sitio entero, si lo informa. */
  usedBytes: number | null;
  quotaBytes: number | null;
}

export async function estimateStorage(): Promise<StorageUsage> {
  const downloads = await getDownloads();
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  return {
    downloadedBytes: downloads.reduce((total, entry) => total + entry.bytes, 0),
    chapters: downloads.length,
    usedBytes: estimate?.usage ?? null,
    quotaBytes: estimate?.quota ?? null,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit] ?? 'GB'}`;
}
