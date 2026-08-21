import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MangaDexError } from '../api/client';
import { hasReadableChapters, searchManga } from '../api/mangadex';
import type { Manga } from '../api/types';
import CoverImage from '../components/CoverImage';
import MangaCard from '../components/MangaCard';
import Spinner from '../components/Spinner';
import StateMessage from '../components/StateMessage';
import { getLibrary, getRecentProgress } from '../db';
import type { LibraryEntry, ProgressEntry } from '../db/schema';
import { useDebounce } from '../hooks/useDebounce';

type Status = 'idle' | 'loading' | 'done' | 'error';

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Manga[]>([]);
  /** Obras ya descartadas por no tener capítulos que la app pueda abrir. */
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>('idle');
  const [recent, setRecent] = useState<ProgressEntry[]>([]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const [error, setError] = useState('');
  const debouncedQuery = useDebounce(query.trim(), 400);

  useEffect(() => {
    void getRecentProgress().then(setRecent);
    void getLibrary().then(setLibrary);
  }, []);

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setResults([]);
      setStatus('idle');
      return;
    }

    // Cada búsqueda cancela la anterior: el debounce recorta la mayoría, pero
    // igual pueden quedar dos en vuelo si la API tarda.
    const controller = new AbortController();
    setStatus('loading');
    setError('');

    searchManga(debouncedQuery, controller.signal)
      .then((found) => {
        setResults(found);
        setHidden(new Set());
        setStatus('done');

        // Las obras licenciadas sólo enlazan al lector oficial. MangaDex no deja
        // filtrarlas en la búsqueda, así que se comprueba una por una y se van
        // sacando de la grilla; el resultado queda cacheado por sesión.
        for (const manga of found) {
          void hasReadableChapters(manga.id, controller.signal)
            .then((readable) => {
              if (readable || controller.signal.aborted) return;
              setHidden((current) => new Set(current).add(manga.id));
            })
            .catch(() => undefined);
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof MangaDexError ? cause.message : 'No se pudo buscar.');
        setStatus('error');
      });

    return () => {
      controller.abort();
    };
  }, [debouncedQuery]);

  const visible = results.filter((manga) => !hidden.has(manga.id));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-ink-200">Manga Reader</h1>
        <Link to="/almacenamiento" className="text-sm text-ink-400 hover:text-ink-200">
          Almacenamiento
        </Link>
      </div>

      <input
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder="Buscar una obra…"
        autoFocus
        className="w-full rounded-lg border border-ink-600 bg-ink-800 px-4 py-3 text-base text-ink-200 placeholder:text-ink-400 focus:border-accent focus:outline-none"
      />

      {status === 'loading' ? <Spinner label="Buscando…" /> : null}

      {status === 'error' ? <StateMessage title="Falló la búsqueda" detail={error} /> : null}

      {status === 'idle' && query.trim().length < 2 ? (
        <>
          {recent.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold text-ink-200">Continuar leyendo</h2>
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recent.map((entry) => (
                  <li key={entry.chapterId}>
                    <Link
                      to={`/read/${entry.chapterId}`}
                      className="flex items-center gap-3 rounded-lg border border-ink-700 p-2 transition-colors hover:bg-ink-800"
                    >
                      <CoverImage
                        src={entry.coverUrl}
                        alt={`Portada de ${entry.mangaTitle}`}
                        className="h-20 w-14 shrink-0 rounded"
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="truncate text-sm text-ink-200">{entry.mangaTitle}</span>
                        <span className="truncate text-xs text-ink-400">{entry.chapterLabel}</span>
                        <span className="text-xs text-accent">
                          {entry.completed
                            ? 'Terminado'
                            : `Página ${entry.page + 1} de ${entry.totalPages}`}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {library.length > 0 ? (
            <section className="mt-8">
              <h2 className="mb-3 text-lg font-semibold text-ink-200">Siguiendo</h2>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
                {library.map((entry) => (
                  <Link key={entry.mangaId} to={`/manga/${entry.mangaId}`} className="flex flex-col gap-2">
                    <CoverImage
                      src={entry.coverUrl}
                      alt={`Portada de ${entry.title}`}
                      className="aspect-[2/3] w-full rounded-lg"
                    />
                    <span className="line-clamp-2 text-xs leading-snug text-ink-200">
                      {entry.title}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {recent.length === 0 && library.length === 0 ? (
            <StateMessage
              title="Buscá una obra para empezar"
              detail="Escribí al menos dos letras del título."
            />
          ) : null}
        </>
      ) : null}

      {status === 'done' && visible.length === 0 && results.length > 0 ? (
        <StateMessage
          title="Nada que puedas leer acá"
          detail={`Las coincidencias con "${debouncedQuery}" son obras licenciadas: MangaDex sólo enlaza al lector oficial y no aloja las páginas.`}
        />
      ) : null}

      {status === 'done' && results.length === 0 ? (
        <StateMessage
          title="Sin resultados"
          detail={`No hay obras que coincidan con "${debouncedQuery}".`}
        />
      ) : null}

      {visible.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visible.map((manga) => (
            <MangaCard key={manga.id} manga={manga} />
          ))}
        </div>
      ) : null}
    </main>
  );
}
