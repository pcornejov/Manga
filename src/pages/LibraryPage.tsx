import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import CoverImage from '../components/CoverImage';
import Icon from '../components/Icon';
import PageHeader from '../components/PageHeader';
import StateMessage from '../components/StateMessage';
import { getLibrary, getRecentProgress } from '../db';
import type { LibraryEntry, ProgressEntry } from '../db/schema';
import { useLibraryUpdates } from '../hooks/useLibraryUpdates';

export default function LibraryPage() {
  const [recent, setRecent] = useState<ProgressEntry[]>([]);
  const [library, setLibrary] = useState<LibraryEntry[]>([]);
  const updates = useLibraryUpdates(library);

  useEffect(() => {
    void getRecentProgress().then(setRecent);
    void getLibrary().then(setLibrary);
  }, []);

  const vacio = recent.length === 0 && library.length === 0;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-safe-nav">
      <PageHeader title="Biblioteca" />

      {vacio ? (
        <StateMessage
          title="Todavía no hay nada acá"
          detail="Lo que empieces a leer y las obras que sigas van a aparecer en esta pantalla."
          icon="library"
          action={
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-ink-900"
            >
              <Icon name="search" className="h-4 w-4" />
              Buscar obras
            </Link>
          }
        />
      ) : null}

      {recent.length > 0 ? (
        <section className="mb-8">
          <h2 className="section-title">Continuar leyendo</h2>
          <ul className="flex flex-col gap-2">
            {recent.map((entry) => {
              const progreso = entry.totalPages
                ? Math.round(((entry.page + 1) / entry.totalPages) * 100)
                : 0;
              return (
                <li key={entry.chapterId}>
                  <Link
                    to={`/read/${entry.chapterId}`}
                    className="surface flex items-center gap-3 p-2 transition-colors hover:bg-ink-700 active:scale-[0.99]"
                  >
                    <CoverImage
                      src={entry.coverUrl}
                      alt=""
                      title={entry.mangaTitle}
                      className="h-20 w-14 shrink-0 rounded-lg"
                    />
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-medium text-ink-200">
                        {entry.mangaTitle}
                      </span>
                      <span className="truncate text-xs text-ink-400">{entry.chapterLabel}</span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-ink-700">
                          <span
                            className="block h-full rounded-full bg-accent"
                            style={{ width: `${entry.completed ? 100 : progreso}%` }}
                          />
                        </span>
                        <span className="shrink-0 text-[11px] tabular-nums text-ink-400">
                          {entry.completed ? 'Terminado' : `${entry.page + 1}/${entry.totalPages}`}
                        </span>
                      </span>
                    </span>
                    <Icon name="chevron" className="h-5 w-5 shrink-0 text-ink-400" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {library.length > 0 ? (
        <section>
          <h2 className="section-title">Siguiendo</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {library.map((entry) => (
              <Link key={entry.mangaId} to={`/manga/${entry.mangaId}`} className="group flex flex-col gap-1.5">
                <span className="relative block">
                  <CoverImage
                    src={entry.coverUrl}
                    alt=""
                    title={entry.title}
                    className="aspect-[2/3] w-full rounded-xl shadow-card transition-transform group-hover:scale-[1.02]"
                  />
                  {updates.has(entry.mangaId) ? (
                    <span className="absolute -right-1 -top-1 rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-900 shadow-card">
                      +{updates.get(entry.mangaId)}
                    </span>
                  ) : null}
                </span>
                <span className="line-clamp-2 min-h-[2.2rem] text-xs leading-snug text-ink-200">
                  {entry.title}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
