import { create } from 'zustand';
import { getSettings, saveSettings } from '../db';
import type { FitMode, ReadingMode } from '../db/schema';

interface Preferences {
  readingMode: ReadingMode;
  fitMode: FitMode;
}

/** Scroll continuo por default: es como se lee cómodo en pantalla, sobre todo en celular. */
const DEFAULTS: Preferences = { readingMode: 'vertical', fitMode: 'width' };

interface ReaderSettingsState {
  global: Preferences;
  /** Preferencias que pisan a las globales, por obra. */
  byManga: Record<string, Preferences>;
  loadedMangaIds: string[];
  loadGlobal: () => Promise<void>;
  loadForManga: (mangaId: string) => Promise<void>;
  /** Preferencias efectivas de una obra: las suyas si tiene, si no las globales. */
  preferences: (mangaId: string | null) => Preferences;
  setReadingMode: (mangaId: string | null, mode: ReadingMode) => void;
  setFitMode: (mangaId: string | null, fit: FitMode) => void;
}

/** Guarda en IndexedDB sin bloquear la UI: la preferencia ya se aplicó en memoria. */
function persist(key: string, preferences: Preferences): void {
  void saveSettings({ key, ...preferences }).catch(() => undefined);
}

export const useReaderSettings = create<ReaderSettingsState>((set, get) => ({
  global: DEFAULTS,
  byManga: {},
  loadedMangaIds: [],

  loadGlobal: async () => {
    const stored = await getSettings('global');
    // La store de ajustes guarda cosas distintas: hay que confirmar que sea una
    // preferencia del lector antes de leerla.
    if (stored && 'readingMode' in stored) {
      set({ global: { readingMode: stored.readingMode, fitMode: stored.fitMode } });
    }
  },

  loadForManga: async (mangaId) => {
    if (get().loadedMangaIds.includes(mangaId)) return;
    const stored = await getSettings(mangaId);
    set((state) => ({
      loadedMangaIds: [...state.loadedMangaIds, mangaId],
      byManga:
        stored && 'readingMode' in stored
          ? {
              ...state.byManga,
              [mangaId]: { readingMode: stored.readingMode, fitMode: stored.fitMode },
            }
          : state.byManga,
    }));
  },

  preferences: (mangaId) => {
    const state = get();
    if (mangaId) {
      const own = state.byManga[mangaId];
      if (own) return own;
    }
    return state.global;
  },

  setReadingMode: (mangaId, readingMode) => {
    const next = { ...get().preferences(mangaId), readingMode };
    if (mangaId) {
      set((state) => ({ byManga: { ...state.byManga, [mangaId]: next } }));
      persist(mangaId, next);
    } else {
      set({ global: next });
      persist('global', next);
    }
  },

  setFitMode: (mangaId, fitMode) => {
    const next = { ...get().preferences(mangaId), fitMode };
    if (mangaId) {
      set((state) => ({ byManga: { ...state.byManga, [mangaId]: next } }));
      persist(mangaId, next);
    } else {
      set({ global: next });
      persist('global', next);
    }
  },
}));
