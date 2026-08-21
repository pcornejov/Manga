import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MangaDexError } from '../api/client';
import {
  authorNames,
  chaptersByLanguage,
  coverUrl,
  dedupeChapters,
  getChapterFeed,
  getManga,
  mangaDescription,
  mangaTitle,
  officialReaderUrl,
  preferredLanguage,
  tagNames,
} from '../api/mangadex';
import type { Chapter, Manga, MangaStatus } from '../api/types';
import ChapterList from '../components/ChapterList';
import CoverImage from '../components/CoverImage';
import Icon from '../components/Icon';
import Spinner from '../components/Spinner';
import PageHeader from '../components/PageHeader';
import StateMessage from '../components/StateMessage';
import {
  followManga,
  getLibraryEntry,
  getMangaDownloads,
  getMangaProgress,
  unfollowManga,
} from '../db';
import type { DownloadEntry, ProgressEntry } from '../db/schema';
import { useMangaStats } from '../hooks/useMangaStats';

const STATUS_LABEL: Record<MangaStatus, string> = {
  ongoing: 'En publicación',
  completed: 'Finalizado',
  hiatus: 'En pausa',
  cancelled: 'Cancelado',
};

export default function MangaPage() {
  const { id } = useParams<{ id: string }>();
  const [manga, setManga] = useState<Manga | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [progressByChapter, setProgressByChapter] = useState<Map<string, ProgressEntry>>(new Map());
  const [downloaded, setDownloaded] = useState<Map<string, DownloadEntry>>(new Map());
  const [language, setLanguage] = useState<string | null>(null);
  const [officialUrl, setOfficialUrl] = useState<string | null>(null);
  /** Lo que se puede mostrar sin red: lo que ya está en IndexedDB. */
  const [sinRed, setSinRed] = useState<{ title: string; cover: string | null; descargas: DownloadEntry[] } | null>(null);
  const [expandida, setExpandida] = useState(false);
  const [todosLosTags, setTodosLosTags] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState('');

  // El hook va antes de los returns condicionales: React exige orden estable.
  const stats = useMangaStats(id ? [id] : []);

  const refreshDownloads = useCallback(async (mangaId: string) => {
    const entries = await getMangaDownloads(mangaId);
    setDownloaded(new Map(entries.map((entry) => [entry.chapterId, entry])));
  }, []);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setLoadedCount(0);
    setLanguage(null);

    (async () => {
      const detail = await getManga(id, controller.signal);
      if (controller.signal.aborted) return;
      setManga(detail);

      const feed = await getChapterFeed(id, controller.signal, (loaded) => {
        setLoadedCount(loaded);
      });
      if (controller.signal.aborted) return;
      setChapters(feed);
      setLanguage(preferredLanguage(feed));

      // Sin capítulos leíbles, puede ser una obra licenciada: se busca el enlace
      // oficial para poder explicar el motivo en vez de dejar la ficha muda.
      if (feed.length === 0) {
        const official = await officialReaderUrl(id, controller.signal).catch(() => null);
        if (!controller.signal.aborted) setOfficialUrl(official);
      }

      const entry = await getLibraryEntry(id);
      setFollowed(entry !== undefined);

      // Visitar la ficha marca la obra como vista: se guarda su estado actual
      // para que el aviso de capítulos nuevos se limpie y vuelva a contar desde
      // acá. Se conserva `addedAt`, si no la obra saltaría al principio de la lista.
      if (entry) {
        await followManga({
          ...entry,
          latestChapterId: detail.attributes.latestUploadedChapter,
          chapterCount: feed.length,
        });
      }

      const progress = await getMangaProgress(id);
      setProgressByChapter(new Map(progress.map((entry) => [entry.chapterId, entry])));
      await refreshDownloads(id);
      setLoading(false);
    })().catch((cause: unknown) => {
      if (controller.signal.aborted) return;

      // Sin red, la obra puede seguir siendo útil: si hay capítulos descargados
      // se arma la ficha con lo guardado en vez de mostrar un error.
      void Promise.all([getLibraryEntry(id), getMangaDownloads(id)]).then(([entry, descargas]) => {
        if (controller.signal.aborted) return;
        if (descargas.length > 0 || entry) {
          setSinRed({
            title: entry?.title ?? descargas[0]?.mangaTitle ?? 'Obra guardada',
            cover: entry?.coverUrl ?? null,
            descargas,
          });
        } else {
          setError(cause instanceof MangaDexError ? cause.message : 'No se pudo cargar la obra.');
        }
        setLoading(false);
      });
    });

    return () => {
      controller.abort();
    };
  }, [id, refreshDownloads]);

  if (sinRed) {
    return (
      <main className="mx-auto max-w-5xl px-4 pb-safe-nav">
        <PageHeader title={sinRed.title} />
        <p className="mb-4 rounded-xl border border-ink-700 bg-ink-800/60 px-4 py-3 text-sm text-ink-400">
          Sin conexión. Se muestran sólo los capítulos que ya descargaste.
        </p>
        {sinRed.descargas.length === 0 ? (
          <StateMessage
            title="No hay capítulos descargados de esta obra"
            detail="Cuando vuelvas a tener conexión vas a poder ver la lista completa."
          />
        ) : (
          <ul className="overflow-hidden rounded-xl border border-ink-700">
            {sinRed.descargas.map((entrada) => (
              <li key={entrada.chapterId} className="border-b border-ink-700/60 last:border-0">
                <Link
                  to={`/read/${entrada.chapterId}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-ink-700"
                >
                  <span className="truncate text-sm text-ink-200">{entrada.chapterLabel}</span>
                  <span className="shrink-0 text-[11px] text-ink-400">
                    {entrada.urls.length} págs
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <StateMessage
          title="No se pudo cargar la obra"
          detail={error}
          action={
            <Link to="/" className="text-sm text-accent hover:underline">
              Volver a la búsqueda
            </Link>
          }
        />
      </main>
    );
  }

  if (!manga) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Spinner label="Cargando obra…" />
      </main>
    );
  }

  const byLanguage = chaptersByLanguage(chapters);
  const languages = [...byLanguage.keys()];
  // Una sola versión de cada capítulo del idioma elegido: las obras populares
  // tienen varios grupos subiendo el mismo número.
  const shown = dedupeChapters(language ? (byLanguage.get(language) ?? []) : []).sort(
    (a, b) => Number(a.attributes.chapter ?? 0) - Number(b.attributes.chapter ?? 0),
  );

  // Idiomas que sí tiene la obra, para explicar un listado vacío sin adivinar.
  const otherLanguages = manga.attributes.availableTranslatedLanguages.filter(
    (language): language is string => language !== null,
  );

  const ownStats = stats.get(manga.id);
  const rating = ownStats?.rating.bayesian ?? ownStats?.rating.average ?? null;
  const follows = ownStats?.follows ?? null;

  const title = mangaTitle(manga);
  const cover = coverUrl(manga, 512);
  const description = mangaDescription(manga);
  const authors = authorNames(manga);
  const tags = tagNames(manga);

  const TAGS_VISIBLES = 6;
  const tagsMostrados = todosLosTags ? tags : tags.slice(0, TAGS_VISIBLES);

  return (
    <main className="mx-auto max-w-5xl pb-safe-nav">
      {/* La portada difuminada de fondo da identidad a la ficha sin costar un
          pedido extra: es la misma imagen que ya se bajó. */}
      <div className="relative">
        <div className="absolute inset-x-0 top-0 h-72 overflow-hidden">
          {cover ? (
            <img
              src={cover}
              alt=""
              aria-hidden
              className="h-full w-full scale-110 object-cover opacity-60 blur-3xl saturate-200"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-b from-ink-900/30 via-ink-900/75 to-ink-900" />
        </div>

        <div className="relative px-4 pt-safe">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1 text-sm text-ink-200 hover:text-accent"
          >
            <Icon name="back" className="h-4 w-4" />
            Volver
          </Link>

          <header className="flex gap-4">
            <CoverImage
              src={cover}
              alt={`Portada de ${title}`}
              title={title}
              className="aspect-[2/3] w-28 shrink-0 rounded-xl shadow-card sm:w-40"
            />

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <h1 className="text-xl font-semibold leading-tight text-ink-200 sm:text-2xl">
                {title}
              </h1>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-400">
                {authors.length > 0 ? <span className="text-ink-200">{authors.join(', ')}</span> : null}
                <span>·</span>
                <span>{STATUS_LABEL[manga.attributes.status]}</span>
                {manga.attributes.year !== null ? (
                  <>
                    <span>·</span>
                    <span>{manga.attributes.year}</span>
                  </>
                ) : null}
              </p>

              {rating !== null ? (
                <p className="flex flex-wrap items-center gap-3 text-xs text-ink-400">
                  <span className="flex items-center gap-1 font-medium text-accent">
                    <Icon name="star" className="h-3.5 w-3.5" />
                    {rating.toFixed(2)}
                  </span>
                  {follows !== null ? <span>{follows.toLocaleString('es')} siguen</span> : null}
                  <span>{shown.length} capítulos</span>
                </p>
              ) : null}

            <button
              type="button"
              onClick={() => {
                const next = !followed;
                setFollowed(next);
                const action = next
                  ? followManga({ mangaId: manga.id, title, coverUrl: cover, addedAt: Date.now() })
                  : unfollowManga(manga.id);
                // Si la escritura falla, el botón vuelve a reflejar la realidad.
                void action.catch(() => {
                  setFollowed(!next);
                });
              }}
              aria-pressed={followed}
              className={`mt-1 inline-flex w-fit items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                followed
                  ? 'bg-ink-700 text-ink-200 hover:bg-ink-600'
                  : 'bg-accent text-ink-900 hover:brightness-110'
              }`}
            >
              {followed ? <Icon name="check" className="h-4 w-4" /> : null}
              {followed ? 'Siguiendo' : 'Seguir'}
            </button>

            </div>
          </header>

          {tags.length > 0 ? (
            <ul className="mt-4 flex flex-wrap gap-1.5">
              {tagsMostrados.map((tag) => (
                <li key={tag} className="rounded-full bg-ink-700/70 px-2.5 py-1 text-[11px] text-ink-200">
                  {tag}
                </li>
              ))}
              {/* Trece etiquetas ocupaban tres filas antes de la sinopsis. */}
              {!todosLosTags && tags.length > TAGS_VISIBLES ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setTodosLosTags(true);
                    }}
                    className="chip chip-off text-[11px] text-ink-400 hover:text-ink-200"
                  >
                    +{tags.length - TAGS_VISIBLES}
                  </button>
                </li>
              ) : null}
            </ul>
          ) : null}

          {description ? (
            <div className="mt-4">
              <p
                className={`whitespace-pre-line text-sm leading-relaxed text-ink-400 ${
                  expandida ? '' : 'line-clamp-4'
                }`}
              >
                {description}
              </p>
              <button
                type="button"
                onClick={() => {
                  setExpandida((current) => !current);
                }}
                className="mt-1 text-xs font-medium text-accent hover:underline"
              >
                {expandida ? 'Ver menos' : 'Ver más'}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="mt-7 px-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-400">
          Capítulos
          {shown.length > 0 ? <span className="ml-2 normal-case">({shown.length})</span> : null}
        </h2>

        {languages.length > 1 ? (
          <div className="no-scrollbar -mx-4 mb-3 flex items-center gap-2 overflow-x-auto px-4">
            <span className="shrink-0 text-xs text-ink-400">Idioma:</span>
            {languages.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={code === language}
                onClick={() => {
                  setLanguage(code);
                }}
                className={`chip ${code === language ? 'chip-on font-medium' : 'chip-off'}`}
              >
                {code} ({byLanguage.get(code)?.length ?? 0})
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <Spinner label={loadedCount > 0 ? `${loadedCount} capítulos…` : 'Cargando capítulos…'} />
        ) : shown.length === 0 ? (
          officialUrl ? (
            <StateMessage
              title="Obra licenciada"
              detail="MangaDex no aloja las páginas de esta obra: sólo enlaza al lector oficial, así que no se puede leer ni descargar acá."
              action={
                <a
                  href={officialUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-accent hover:underline"
                >
                  Abrir en el lector oficial ↗
                </a>
              }
            />
          ) : (
            <StateMessage
              title="Sin capítulos en los idiomas configurados"
              detail={
                otherLanguages.length > 0
                  ? `La app pide español e inglés. Esta obra sólo está traducida a: ${otherLanguages.join(', ')}.`
                  : 'MangaDex no tiene capítulos publicados de esta obra.'
              }
            />
          )
        ) : (
          <ChapterList
            mangaId={manga.id}
            mangaTitle={title}
            coverUrl={cover}
            chapters={shown}
            progressByChapter={progressByChapter}
            downloadedChapters={downloaded}
            onDownloadsChange={() => {
              void refreshDownloads(manga.id);
            }}
            onProgressChange={() => {
              void getMangaProgress(manga.id).then((entries) => {
                setProgressByChapter(new Map(entries.map((entry) => [entry.chapterId, entry])));
              });
            }}
          />
        )}
      </section>
    </main>
  );
}
