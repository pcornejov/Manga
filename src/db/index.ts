import { type IDBPDatabase, openDB } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  type DownloadEntry,
  type LibraryEntry,
  type MangaReaderDB,
  type ProgressEntry,
  type SettingsEntry,
} from './schema';

let dbPromise: Promise<IDBPDatabase<MangaReaderDB>> | null = null;
/** La base ya abierta, para poder escribir sin pasar por un `await`. */
let openedDb: IDBPDatabase<MangaReaderDB> | null = null;

/**
 * Última página vista, espejada en `localStorage`.
 *
 * Al cerrar la pestaña el navegador descarta las transacciones de IndexedDB que
 * quedaron abiertas, pero `localStorage` escribe de forma síncrona y siempre
 * llega. Lo que quede acá se vuelca a IndexedDB en el próximo arranque.
 */
const PENDING_KEY = 'manga-reader:pending-progress';

function readPending(): ProgressEntry | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as ProgressEntry) : null;
  } catch {
    return null;
  }
}

function writePending(entry: ProgressEntry | null): void {
  try {
    if (entry) localStorage.setItem(PENDING_KEY, JSON.stringify(entry));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Sin localStorage (modo privado) se sigue con lo que haya en IndexedDB.
  }
}

/** Vuelca el progreso pendiente si es más nuevo que lo guardado. */
async function restorePending(db: IDBPDatabase<MangaReaderDB>): Promise<void> {
  const pending = readPending();
  if (!pending) return;
  try {
    const stored = await db.get('progress', pending.chapterId);
    if (!stored || stored.updatedAt < pending.updatedAt) await db.put('progress', pending);
  } catch {
    // Si falla, el pendiente se descarta igual: no vale trabar el arranque.
  }
  writePending(null);
}

function getDb(): Promise<IDBPDatabase<MangaReaderDB>> {
  dbPromise ??= openDB<MangaReaderDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const library = db.createObjectStore('library', { keyPath: 'mangaId' });
      library.createIndex('by-addedAt', 'addedAt');

      const progress = db.createObjectStore('progress', { keyPath: 'chapterId' });
      progress.createIndex('by-manga', 'mangaId');
      progress.createIndex('by-updatedAt', 'updatedAt');

      db.createObjectStore('settings', { keyPath: 'key' });

      const downloads = db.createObjectStore('downloads', { keyPath: 'chapterId' });
      downloads.createIndex('by-manga', 'mangaId');
    },
  }).then(async (db) => {
    openedDb = db;
    // Antes de que nadie lea, se recupera lo que quedó del cierre anterior.
    await restorePending(db);
    return db;
  });
  return dbPromise;
}

// --- Biblioteca ---

export async function getLibrary(): Promise<LibraryEntry[]> {
  const db = await getDb();
  const entries = await db.getAllFromIndex('library', 'by-addedAt');
  return entries.reverse();
}

export async function getLibraryEntry(mangaId: string): Promise<LibraryEntry | undefined> {
  const db = await getDb();
  return db.get('library', mangaId);
}

export async function isFollowed(mangaId: string): Promise<boolean> {
  return (await getLibraryEntry(mangaId)) !== undefined;
}

export async function followManga(entry: LibraryEntry): Promise<void> {
  const db = await getDb();
  await db.put('library', entry);
}

export async function unfollowManga(mangaId: string): Promise<void> {
  const db = await getDb();
  await db.delete('library', mangaId);
}

// --- Progreso ---

export async function getProgress(chapterId: string): Promise<ProgressEntry | undefined> {
  const db = await getDb();
  return db.get('progress', chapterId);
}

export async function getMangaProgress(mangaId: string): Promise<ProgressEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex('progress', 'by-manga', mangaId);
}

export async function saveProgress(entry: ProgressEntry): Promise<void> {
  const db = await getDb();
  await db.put('progress', entry);
}

/**
 * Guarda el progreso arrancando la transacción de forma síncrona.
 *
 * Al cerrar la pestaña el documento se destruye enseguida: una escritura que
 * empieza después de un `await` no llega a confirmarse y se pierde la última
 * página leída.
 */
export function saveProgressNow(entry: ProgressEntry): void {
  // Primero el espejo síncrono: es el único que se garantiza que sobrevive.
  writePending(entry);
  if (!openedDb) {
    void saveProgress(entry)
      .then(() => {
        writePending(null);
      })
      .catch(() => undefined);
    return;
  }
  void openedDb
    .put('progress', entry)
    .then(() => {
      writePending(null);
    })
    .catch(() => undefined);
}

/** Últimas lecturas, una por obra, de la más reciente a la más vieja. */
export async function getRecentProgress(limit = 12): Promise<ProgressEntry[]> {
  const db = await getDb();
  const all = await db.getAllFromIndex('progress', 'by-updatedAt');
  const latestPerManga = new Map<string, ProgressEntry>();
  // El índice viene ascendente: recorrer al revés deja la más reciente por obra.
  for (let i = all.length - 1; i >= 0; i -= 1) {
    const entry = all[i];
    if (entry && !latestPerManga.has(entry.mangaId)) latestPerManga.set(entry.mangaId, entry);
  }
  return [...latestPerManga.values()].slice(0, limit);
}

// --- Preferencias ---

export async function getSettings(key: string): Promise<SettingsEntry | undefined> {
  const db = await getDb();
  return db.get('settings', key);
}

export async function saveSettings(entry: SettingsEntry): Promise<void> {
  const db = await getDb();
  await db.put('settings', entry);
}

// --- Descargas ---

export async function getDownload(chapterId: string): Promise<DownloadEntry | undefined> {
  const db = await getDb();
  return db.get('downloads', chapterId);
}

export async function getDownloads(): Promise<DownloadEntry[]> {
  const db = await getDb();
  return db.getAll('downloads');
}

export async function getMangaDownloads(mangaId: string): Promise<DownloadEntry[]> {
  const db = await getDb();
  return db.getAllFromIndex('downloads', 'by-manga', mangaId);
}

export async function saveDownload(entry: DownloadEntry): Promise<void> {
  const db = await getDb();
  await db.put('downloads', entry);
}

export async function deleteDownload(chapterId: string): Promise<void> {
  const db = await getDb();
  await db.delete('downloads', chapterId);
}
