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
import Spinner from '../components/Spinner';
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
      setError(cause instanceof MangaDexError ? cause.message : 'No se pudo cargar la obra.');
      setLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [id, refreshDownloads]);

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

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Link to="/" className="mb-5 inline-block text-sm text-ink-400 hover:text-ink-200">
        ← Buscar
      </Link>

      <header className="flex flex-col gap-5 sm:flex-row">
        <CoverImage
          src={cover}
          alt={`Portada de ${title}`}
          className="aspect-[2/3] w-40 shrink-0 rounded-lg sm:w-52"
        />

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h1 className="text-2xl font-semibold text-ink-200">{title}</h1>
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
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                followed
                  ? 'bg-ink-700 text-ink-200 hover:bg-ink-600'
                  : 'bg-accent text-ink-900 hover:brightness-110'
              }`}
            >
              {followed ? 'Siguiendo ✓' : 'Seguir'}
            </button>
          </div>

          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-400">
            {authors.length > 0 ? (
              <div className="flex gap-2">
                <dt>Autor:</dt>
                <dd className="text-ink-200">{authors.join(', ')}</dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt>Estado:</dt>
              <dd className="text-ink-200">{STATUS_LABEL[manga.attributes.status]}</dd>
            </div>
            {rating !== null ? (
              <div className="flex gap-2">
                <dt>Puntuación:</dt>
                <dd className="tabular-nums text-accent">★ {rating.toFixed(2)} / 10</dd>
              </div>
            ) : null}
            {follows !== null ? (
              <div className="flex gap-2">
                <dt>Siguen:</dt>
                <dd className="tabular-nums text-ink-200">{follows.toLocaleString('es')}</dd>
              </div>
            ) : null}
            {manga.attributes.year !== null ? (
              <div className="flex gap-2">
                <dt>Año:</dt>
                <dd className="text-ink-200">{manga.attributes.year}</dd>
              </div>
            ) : null}
          </dl>

          {tags.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-full bg-ink-700 px-2.5 py-1 text-xs text-ink-200"
                >
                  {tag}
                </li>
              ))}
            </ul>
          ) : null}

          {description ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-400">
              {description}
            </p>
          ) : null}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-ink-200">
          Capítulos
          {shown.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-ink-400">({shown.length})</span>
          ) : null}
        </h2>

        {languages.length > 1 ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-400">Idioma:</span>
            {languages.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={code === language}
                onClick={() => {
                  setLanguage(code);
                }}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                  code === language
                    ? 'bg-accent text-ink-900'
                    : 'bg-ink-700 text-ink-200 hover:bg-ink-600'
                }`}
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
            chapters={shown}
            progressByChapter={progressByChapter}
            downloadedChapters={downloaded}
            onDownloadsChange={() => {
              void refreshDownloads(manga.id);
            }}
          />
        )}
      </section>
    </main>
  );
}
