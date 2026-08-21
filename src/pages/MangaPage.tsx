import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MangaDexError } from '../api/client';
import {
  authorNames,
  coverUrl,
  getChapterFeed,
  getManga,
  isReadable,
  mangaDescription,
  mangaTitle,
  tagNames,
} from '../api/mangadex';
import type { Chapter, Manga, MangaStatus } from '../api/types';
import ChapterList from '../components/ChapterList';
import CoverImage from '../components/CoverImage';
import Spinner from '../components/Spinner';
import StateMessage from '../components/StateMessage';
import { followManga, getMangaProgress, isFollowed, unfollowManga } from '../db';
import type { ProgressEntry } from '../db/schema';

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
  const [followed, setFollowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setLoadedCount(0);

    (async () => {
      const detail = await getManga(id, controller.signal);
      if (controller.signal.aborted) return;
      setManga(detail);

      const feed = await getChapterFeed(id, controller.signal, (loaded) => {
        setLoadedCount(loaded);
      });
      if (controller.signal.aborted) return;
      setChapters(feed.filter(isReadable));

      setFollowed(await isFollowed(id));

      const progress = await getMangaProgress(id);
      setProgressByChapter(new Map(progress.map((entry) => [entry.chapterId, entry])));
      setLoading(false);
    })().catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof MangaDexError ? cause.message : 'No se pudo cargar la obra.');
      setLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [id]);

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
          {chapters.length > 0 ? (
            <span className="ml-2 text-sm font-normal text-ink-400">({chapters.length})</span>
          ) : null}
        </h2>

        {loading ? (
          <Spinner label={loadedCount > 0 ? `${loadedCount} capítulos…` : 'Cargando capítulos…'} />
        ) : chapters.length === 0 ? (
          <StateMessage
            title="Sin capítulos legibles"
            detail="Esta obra no tiene capítulos traducidos a los idiomas configurados."
          />
        ) : (
          <ChapterList chapters={chapters} progressByChapter={progressByChapter} />
        )}
      </section>
    </main>
  );
}
