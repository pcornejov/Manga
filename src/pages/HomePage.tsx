import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MangaDexError } from '../api/client';
import {
  type BrowseFilter,
  getGenres,
  getPopular,
  getRecentlyUpdated,
  getTopRated,
  hasReadableChapters,
  pickLocalized,
  searchManga,
} from '../api/mangadex';
import type { Manga, Tag } from '../api/types';
import CollectionGrid from '../components/CollectionGrid';
import DiscoverySection from '../components/DiscoverySection';
import FeaturedManga from '../components/FeaturedManga';
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

/**
 * Atajos: colecciones que no son un género y que si no habría que armar a mano
 * con la búsqueda cada vez.
 *
 * `verify` comprueba obra por obra que se pueda abrir. Hace falta en las
 * terminadas, donde medimos que sólo 13 de las 24 más seguidas son leíbles —el
 * resto están licenciadas—, y no en las otras dos, donde son 23 de 24 y el
 * chequeo sólo retrasaría la fila.
 */
const PRESETS = [
  { id: 'completed', label: 'Terminadas', filtro: { status: 'completed' }, verify: true },
  { id: 'erotica', label: 'Erótico', filtro: { rating: 'erotica' }, verify: false },
  { id: 'pornographic', label: 'Pornográfico', filtro: { rating: 'pornographic' }, verify: false },
] as const;

type Preset = (typeof PRESETS)[number];

/** Lo que se está mirando cuando no es el inicio suelto. */
type Seleccion = { kind: 'genre'; tag: Tag } | { kind: 'preset'; preset: Preset };

/**
 * Píldora de atajo. El punto de acento la separa de las de género, que son las
 * otras veinticinco de la misma fila.
 */
function PresetChip({ preset, onClick }: { preset: Preset; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip bg-ink-700 font-medium text-ink-200 ring-1 ring-inset ring-ink-600 hover:bg-ink-600"
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
      {preset.label}
    </button>
  );
}

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
  const [seleccion, setSeleccion] = useState<Seleccion | null>(null);
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
  // Estable entre renders: la grilla lo usa de disparador para reiniciarse.
  const filtroSeleccion = useMemo<BrowseFilter | null>(() => {
    if (seleccion === null) return null;
    return seleccion.kind === 'genre' ? { tagId: seleccion.tag.id } : seleccion.preset.filtro;
  }, [seleccion]);

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
                className={value ? 'select-chip-on' : 'select-chip'}
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
                className="chip chip-off text-ink-400 hover:text-ink-200"
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
              icon="search"
            />
          ) : null}

          {status === 'done' && results.length === 0 ? (
            <StateMessage
              title="Sin resultados"
              detail={`No hay obras que coincidan con "${debouncedQuery}".`}
              icon="search"
            />
          ) : null}

          {visible.length > 0 ? (
            <>
              <p className="mb-3 text-xs text-ink-400">
                {visible.length} {visible.length === 1 ? 'obra' : 'obras'}
                {hidden.size > 0 ? ` · ${hidden.size} licenciadas ocultas` : ''}
              </p>
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {visible.map((manga) => (
                  <MangaCard key={manga.id} manga={manga} stats={searchStats.get(manga.id)} />
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : (
        <>
          {seleccion === null ? <FeaturedManga /> : null}

          {/* Una sola fila que se desplaza: primero los atajos, después los 25
              géneros. En bloque empujaban el contenido fuera de la pantalla
              antes de que se viera una sola portada. */}
          <div className="no-scrollbar -mx-4 mb-2 flex items-center gap-2 overflow-x-auto px-4 pb-1">
            {seleccion !== null ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSeleccion(null);
                  }}
                  className="chip chip-on font-medium"
                >
                  ✕{' '}
                  {seleccion.kind === 'genre'
                    ? pickLocalized(seleccion.tag.attributes.name)
                    : seleccion.preset.label}
                </button>
                {/* Los otros atajos siguen a mano: son tres y saltar de uno a
                    otro es justamente para lo que están. Los géneros no, que son
                    veinticinco y taparían el resultado. */}
                {PRESETS.filter(
                  (preset) => seleccion.kind !== 'preset' || preset.id !== seleccion.preset.id,
                ).map((preset) => (
                  <PresetChip
                    key={preset.id}
                    preset={preset}
                    onClick={() => {
                      setSeleccion({ kind: 'preset', preset });
                    }}
                  />
                ))}
              </>
            ) : (
              <>
                {PRESETS.map((preset) => (
                  <PresetChip
                    key={preset.id}
                    preset={preset}
                    onClick={() => {
                      setSeleccion({ kind: 'preset', preset });
                    }}
                  />
                ))}
                {/* Separa los atajos de los géneros sin gastar una fila entera. */}
                {genres.length > 0 ? (
                  <span aria-hidden className="h-5 w-px shrink-0 bg-ink-600" />
                ) : null}
                {genres.map((genre) => (
                  <button
                    key={genre.id}
                    type="button"
                    onClick={() => {
                      setSeleccion({ kind: 'genre', tag: genre });
                    }}
                    className="chip chip-off"
                  >
                    {pickLocalized(genre.attributes.name)}
                  </button>
                ))}
              </>
            )}
          </div>

          {seleccion !== null && filtroSeleccion !== null ? (
            <CollectionGrid
              key={seleccion.kind === 'genre' ? seleccion.tag.id : seleccion.preset.id}
              title={
                seleccion.kind === 'genre'
                  ? pickLocalized(seleccion.tag.attributes.name)
                  : seleccion.preset.label
              }
              filtro={filtroSeleccion}
              verify={seleccion.kind === 'genre' ? true : seleccion.preset.verify}
              emptyDetail="Las obras más seguidas de esta selección están licenciadas."
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
