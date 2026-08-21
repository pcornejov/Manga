import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MangaDexError } from '../api/client';
import {
  getByTag,
  getGenres,
  getPopular,
  getRecentlyUpdated,
  getTopRated,
  hasReadableChapters,
  pickLocalized,
  searchManga,
} from '../api/mangadex';
import type { Manga, Tag } from '../api/types';
import DiscoverySection from '../components/DiscoverySection';
import Icon from '../components/Icon';
import MangaCard from '../components/MangaCard';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import StateMessage from '../components/StateMessage';
import { useDebounce } from '../hooks/useDebounce';
import { useMangaStats } from '../hooks/useMangaStats';

type Status = 'idle' | 'loading' | 'done' | 'error';

const STATUS_FILTERS = [
  { value: 'ongoing', label: 'En publicación' },
  { value: 'completed', label: 'Finalizado' },
  { value: 'hiatus', label: 'En pausa' },
  { value: 'cancelled', label: 'Cancelado' },
] as const;

const DEMOGRAPHIC_FILTERS = [
  { value: 'shounen', label: 'Shounen' },
  { value: 'shoujo', label: 'Shoujo' },
  { value: 'seinen', label: 'Seinen' },
  { value: 'josei', label: 'Josei' },
] as const;

export default function HomePage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Manga[]>([]);
  /** Obras ya descartadas por no tener capítulos que la app pueda abrir. */
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const [genres, setGenres] = useState<Tag[]>([]);
  const [status_, setStatusFilter] = useState('');
  const [demographic, setDemographic] = useState('');
  const [activeGenre, setActiveGenre] = useState<Tag | null>(null);
  const debouncedQuery = useDebounce(query.trim(), 400);

  useEffect(() => {
    void getGenres()
      .then(setGenres)
      .catch(() => undefined);
  }, []);

  // Envueltos en `useCallback` para no relanzar la carga en cada render.
  const loadRecent = useCallback((signal: AbortSignal) => getRecentlyUpdated(signal), []);
  const loadPopular = useCallback((signal: AbortSignal) => getPopular(signal), []);
  const loadTopRated = useCallback((signal: AbortSignal) => getTopRated(signal), []);
  const loadGenre = useCallback(
    (signal: AbortSignal) => getByTag(activeGenre?.id ?? '', signal),
    [activeGenre],
  );

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

    searchManga(debouncedQuery, controller.signal, 20, {
      status: status_ || undefined,
      demographic: demographic || undefined,
    })
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
  }, [debouncedQuery, status_, demographic]);

  const visible = results.filter((manga) => !hidden.has(manga.id));
  const searchStats = useMangaStats(visible.map((manga) => manga.id));
  const buscando = query.trim().length >= 2;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-safe-nav">
      <PageHeader
        title="Descubrir"
        action={
          <Link
            to="/ajustes"
            aria-label="Ajustes"
            className="grid h-9 w-9 place-items-center rounded-full text-ink-400 hover:bg-ink-700 hover:text-ink-200"
          >
            <Icon name="settings" className="h-5 w-5" />
          </Link>
        }
      />

      <div className="relative mb-5">
        <Icon
          name="search"
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
          placeholder="Buscar una obra…"
          className="w-full rounded-xl border border-ink-700 bg-ink-800 py-3 pl-11 pr-4 text-base text-ink-200 placeholder:text-ink-400 focus:border-accent focus:outline-none"
        />
      </div>

      {buscando ? (
        <>
          {/* Acotar la búsqueda: en un catálogo de 50.000 obras, "dragon" trae
              de todo. */}
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
            {(
              [
                ['Estado', status_, setStatusFilter, STATUS_FILTERS],
                ['Demografía', demographic, setDemographic, DEMOGRAPHIC_FILTERS],
              ] as const
            ).map(([label, value, set, options]) => (
              <select
                key={label}
                value={value}
                onChange={(event) => {
                  set(event.target.value);
                }}
                aria-label={label}
                className={`shrink-0 rounded-full border-0 px-3 py-1.5 text-xs outline-none ${
                  value ? 'bg-accent font-medium text-ink-900' : 'bg-ink-700 text-ink-200'
                }`}
              >
                <option value="">{label}</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ))}
            {status_ || demographic ? (
              <button
                type="button"
                onClick={() => {
                  setStatusFilter('');
                  setDemographic('');
                }}
                className="shrink-0 rounded-full bg-ink-700 px-3 py-1.5 text-xs text-ink-400 hover:text-ink-200"
              >
                Limpiar
              </button>
            ) : null}
          </div>

          {status === 'loading' ? <Spinner label="Buscando…" /> : null}
          {status === 'error' ? <StateMessage title="Falló la búsqueda" detail={error} /> : null}

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
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {visible.map((manga) => (
                <MangaCard key={manga.id} manga={manga} stats={searchStats.get(manga.id)} />
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {/* Fila que se desplaza: 25 géneros en bloque empujaban el contenido
              fuera de la pantalla antes de que se viera una sola portada. */}
          {genres.length > 0 ? (
            <div className="no-scrollbar -mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1">
              {activeGenre ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveGenre(null);
                  }}
                  className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-ink-900"
                >
                  ✕ {pickLocalized(activeGenre.attributes.name)}
                </button>
              ) : (
                genres.map((genre) => (
                  <button
                    key={genre.id}
                    type="button"
                    onClick={() => {
                      setActiveGenre(genre);
                    }}
                    className="shrink-0 rounded-full bg-ink-700 px-3 py-1.5 text-xs text-ink-200 transition-colors hover:bg-ink-600"
                  >
                    {pickLocalized(genre.attributes.name)}
                  </button>
                ))
              )}
            </div>
          ) : null}

          {activeGenre ? (
            <DiscoverySection
              key={activeGenre.id}
              title={pickLocalized(activeGenre.attributes.name)}
              load={loadGenre}
              verify
              emptyDetail="Las obras más seguidas de este género están licenciadas."
            />
          ) : (
            <>
              <DiscoverySection title="Novedades" load={loadRecent} />
              <DiscoverySection title="Mejor valoradas" load={loadTopRated} verify />
              <DiscoverySection title="Populares" load={loadPopular} verify />
            </>
          )}
        </>
      )}
    </main>
  );
}
