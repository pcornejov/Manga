import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MangaDexError } from '../api/client';
import { preloadImage } from '../api/imageLoader';
import {
  chapterLabel as buildChapterLabel,
  chapterManga,
  coverUrl,
  getCachedChapterFeed,
  getCachedManga,
  getChapter,
  getChapterPageUrls,
  isReadable,
  pickLocalized,
} from '../api/mangadex';
import type { Chapter } from '../api/types';
import PagedReader from '../components/reader/PagedReader';
import ReaderChrome from '../components/reader/ReaderChrome';
import VerticalReader from '../components/reader/VerticalReader';
import Spinner from '../components/Spinner';
import StateMessage from '../components/StateMessage';
import { getDownload, getProgress, saveProgress, saveProgressNow } from '../db';
import type { ProgressEntry } from '../db/schema';
import { useAutoHide } from '../hooks/useAutoHide';
import { useReaderSettings } from '../store/readerSettings';

/** Páginas que se van bajando por delante de la actual. */
const PRELOAD_AHEAD = 2;
/** Pasar páginas rápido no debe escribir en IndexedDB una vez por página. */
const PROGRESS_THROTTLE_MS = 1_000;

interface ChapterPages {
  data: string[];
  dataSaver: string[];
}

export default function ReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();

  /** Etiqueta del capítulo; sin conexión sale del registro de descarga. */
  const [label, setLabel] = useState('');
  const [mangaId, setMangaId] = useState<string | null>(null);
  const [mangaTitle, setMangaTitle] = useState('');
  const [pages, setPages] = useState<ChapterPages>({ data: [], dataSaver: [] });
  const [cover, setCover] = useState<string | null>(null);
  const [nextChapter, setNextChapter] = useState<Chapter | null>(null);
  /** El feed tarda: hasta que llegue no se sabe si hay capítulo siguiente. */
  const [feedLoaded, setFeedLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');

  const chrome = useAutoHide();
  const { preferences, loadGlobal, loadForManga, setReadingMode, setFitMode } = useReaderSettings();
  const { readingMode, fitMode } = preferences(mangaId);

  useEffect(() => {
    void loadGlobal();
  }, [loadGlobal]);

  useEffect(() => {
    if (mangaId) void loadForManga(mangaId);
  }, [mangaId, loadForManga]);

  // Carga del capítulo: metadatos, páginas y vecinos del feed.
  useEffect(() => {
    if (!chapterId) return;
    const controller = new AbortController();
    setLabel('');
    setNextChapter(null);
    setFeedLoaded(false);
    setPages({ data: [], dataSaver: [] });
    setIndex(0);
    setError('');

    (async () => {
      // Un capítulo descargado tiene que abrirse sin red: sus URLs y su etiqueta
      // ya están en IndexedDB, así que la API pasa a ser opcional.
      const download = await getDownload(chapterId);
      if (controller.signal.aborted) return;

      if (download) {
        setLabel(download.chapterLabel);
        setMangaId(download.mangaId);
        setMangaTitle(download.mangaTitle);
      }

      let current: Chapter | null = null;
      try {
        current = await getChapter(chapterId, controller.signal);
      } catch (cause) {
        if (!download) throw cause;
      }
      if (controller.signal.aborted) return;

      if (current) {
        setLabel(buildChapterLabel(current));
        const manga = chapterManga(current);
        setMangaId(manga?.id ?? download?.mangaId ?? null);
        if (manga?.attributes) setMangaTitle(pickLocalized(manga.attributes.title, ''));
        if (manga?.id) {
          // Sólo para guardar la portada junto al progreso; no bloquea la lectura.
          void getCachedManga(manga.id, controller.signal)
            .then((detail) => {
              if (!controller.signal.aborted) setCover(coverUrl(detail, 256));
            })
            .catch(() => undefined);
        }
      }

      // Las páginas descargadas se sirven por sus URLs originales: pedir un nodo
      // nuevo devolvería direcciones que no están en la caché.
      let data: string[];
      let dataSaver: string[];
      if (download) {
        data = download.urls;
        dataSaver = download.urls;
      } else {
        [data, dataSaver] = await Promise.all([
          getChapterPageUrls(chapterId, 'data', controller.signal),
          getChapterPageUrls(chapterId, 'data-saver', controller.signal),
        ]);
      }
      if (controller.signal.aborted) return;
      setPages({ data, dataSaver });

      // Reanudar donde se dejó, salvo que el capítulo ya esté terminado.
      const stored = await getProgress(chapterId);
      if (!controller.signal.aborted && stored && !stored.completed) {
        setIndex(Math.min(stored.page, Math.max(0, data.length - 1)));
      }

      const feedMangaId = current ? chapterManga(current)?.id : download?.mangaId;
      if (!feedMangaId || !current) return;

      // El encadenado necesita el feed; sin red simplemente no hay siguiente.
      let feed: Chapter[];
      try {
        feed = await getCachedChapterFeed(feedMangaId, controller.signal);
      } catch {
        return;
      }
      if (controller.signal.aborted) return;

      // Los vecinos se buscan dentro del mismo idioma: encadenar a otra
      // traducción a mitad de la obra no tiene sentido.
      const sameLanguage = feed
        .filter(isReadable)
        .filter(
          (item) =>
            item.attributes.translatedLanguage === current.attributes.translatedLanguage,
        );
      const position = sameLanguage.findIndex((item) => item.id === chapterId);
      setNextChapter(position >= 0 ? (sameLanguage[position + 1] ?? null) : null);
      setFeedLoaded(true);
    })().catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof MangaDexError ? cause.message : 'No se pudo abrir el capítulo.');
    });

    return () => {
      controller.abort();
    };
  }, [chapterId]);

  const total = pages.data.length;
  const atEnd = total > 0 && index >= total - 1;

  // Precarga acotada: sólo las dos siguientes, nunca el capítulo entero.
  useEffect(() => {
    for (let offset = 1; offset <= PRELOAD_AHEAD; offset += 1) {
      const url = pages.data[index + offset];
      if (url) preloadImage(url);
    }
  }, [index, pages.data]);

  // Guardado de progreso con throttle: escribe como mucho una vez por segundo y
  // deja siempre pendiente el último valor, que es el que importa.
  const lastSavedAt = useRef(0);
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshot = useRef<ProgressEntry | null>(null);

  useEffect(() => {
    if (!chapterId || !mangaId || total === 0 || !label) return;

    snapshot.current = {
      chapterId,
      mangaId,
      mangaTitle,
      coverUrl: cover,
      page: index,
      totalPages: total,
      completed: index >= total - 1,
      chapterLabel: label,
      updatedAt: Date.now(),
    };

    const flush = (): void => {
      const entry = snapshot.current;
      if (!entry) return;
      lastSavedAt.current = Date.now();
      pendingSave.current = null;
      void saveProgress({ ...entry, updatedAt: Date.now() }).catch(() => undefined);
    };

    const sinceLast = Date.now() - lastSavedAt.current;
    if (sinceLast >= PROGRESS_THROTTLE_MS) {
      flush();
      return;
    }
    if (pendingSave.current) return;
    pendingSave.current = setTimeout(flush, PROGRESS_THROTTLE_MS - sinceLast);
  }, [chapterId, mangaId, mangaTitle, cover, label, index, total]);

  // Cerrar la pestaña o dejar el lector no puede perder la última página vista.
  useEffect(() => {
    const flushNow = (): void => {
      const entry = snapshot.current;
      if (!entry) return;
      if (pendingSave.current) {
        clearTimeout(pendingSave.current);
        pendingSave.current = null;
      }
      saveProgressNow({ ...entry, updatedAt: Date.now() });
    };

    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') flushNow();
    };

    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flushNow);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flushNow);
      flushNow();
    };
  }, []);

  const goTo = useCallback(
    (next: number) => {
      setIndex((current) => {
        const clamped = Math.min(Math.max(next, 0), Math.max(0, total - 1));
        return clamped === current ? current : clamped;
      });
    },
    [total],
  );

  const onNext = useCallback(() => {
    goTo(index + 1);
  }, [goTo, index]);

  const onPrev = useCallback(() => {
    goTo(index - 1);
  }, [goTo, index]);

  // El teclado siempre avanza con la flecha que apunta al sentido de lectura.
  // Va por ref para que el listener no se vuelva a colgar en cada página.
  const keyHandlers = useRef({ onNext, onPrev, readingMode });
  useEffect(() => {
    keyHandlers.current = { onNext, onPrev, readingMode };
  }, [onNext, onPrev, readingMode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const { onNext: next, onPrev: prev, readingMode: mode } = keyHandlers.current;
      switch (event.key) {
        case 'ArrowRight':
          if (mode === 'rtl') prev();
          else next();
          break;
        case 'ArrowLeft':
          if (mode === 'rtl') next();
          else prev();
          break;
        case 'ArrowDown':
        case 'PageDown':
        case ' ':
          if (mode !== 'vertical') {
            event.preventDefault();
            next();
          }
          break;
        case 'ArrowUp':
        case 'PageUp':
          if (mode !== 'vertical') {
            event.preventDefault();
            prev();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (error) {
    return (
      <StateMessage
        title="No se pudo abrir el capítulo"
        detail={error}
        action={
          <Link to="/" className="text-sm text-accent hover:underline">
            Volver a la búsqueda
          </Link>
        }
      />
    );
  }

  if (total === 0) {
    return <Spinner label="Cargando capítulo…" />;
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-ink-900">
      {readingMode === 'vertical' ? (
        <VerticalReader
          pages={pages.data}
          fallbackPages={pages.dataSaver}
          index={index}
          fitMode={fitMode}
          onIndexChange={goTo}
          onToggleChrome={chrome.toggle}
        />
      ) : (
        <PagedReader
          pages={pages.data}
          fallbackPages={pages.dataSaver}
          index={index}
          mode={readingMode}
          fitMode={fitMode}
          onPrev={onPrev}
          onNext={onNext}
          onToggleChrome={chrome.toggle}
        />
      )}

      {atEnd && feedLoaded ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-30 flex justify-center px-4">
          {nextChapter ? (
            <button
              type="button"
              onClick={() => {
                navigate(`/read/${nextChapter.id}`);
              }}
              className="pointer-events-auto rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-ink-900 shadow-lg"
            >
              Siguiente: {buildChapterLabel(nextChapter)} →
            </button>
          ) : (
            <span className="pointer-events-auto rounded-full bg-ink-700 px-5 py-2.5 text-sm text-ink-200">
              Último capítulo disponible
            </span>
          )}
        </div>
      ) : null}

      <ReaderChrome
        visible={chrome.visible}
        mangaId={mangaId}
        title={mangaTitle}
        chapterLabel={label}
        index={index}
        total={total}
        mode={readingMode}
        fitMode={fitMode}
        onModeChange={(mode) => {
          setReadingMode(mangaId, mode);
          chrome.show();
        }}
        onFitChange={(fit) => {
          setFitMode(mangaId, fit);
          chrome.show();
        }}
        onSeek={goTo}
      />
    </div>
  );
}
