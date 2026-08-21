import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  coverUrl,
  getTopRated,
  hasReadableChapters,
  mangaDescription,
  mangaTitle,
  tagNames,
} from '../api/mangadex';
import type { Manga } from '../api/types';
import { useMangaStats } from '../hooks/useMangaStats';
import CoverImage from './CoverImage';
import Icon from './Icon';

/** Cuántas candidatas se comprueban antes de rendirse. */
const MAX_INTENTOS = 6;

/**
 * Obra destacada arriba del inicio.
 *
 * La pantalla era una sucesión de carruseles iguales, sin nada donde apoyar la
 * vista al entrar. Se elige la mejor puntuada que se pueda leer.
 */
export default function FeaturedManga() {
  const [manga, setManga] = useState<Manga | null>(null);
  const stats = useMangaStats(manga ? [manga.id] : []);

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      const candidatas = await getTopRated(controller.signal, MAX_INTENTOS);
      for (const candidata of candidatas) {
        if (controller.signal.aborted) return;
        if (await hasReadableChapters(candidata.id, controller.signal)) {
          setManga(candidata);
          return;
        }
      }
    })().catch(() => undefined);

    return () => {
      controller.abort();
    };
  }, []);

  if (!manga) {
    return <div className="mb-7 h-44 w-full shimmer rounded-2xl" />;
  }

  const title = mangaTitle(manga);
  const cover = coverUrl(manga, 512);
  const rating = stats.get(manga.id)?.rating.bayesian ?? null;
  const tags = tagNames(manga).slice(0, 3);

  return (
    <Link
      to={`/manga/${manga.id}`}
      className="relative mb-7 block overflow-hidden rounded-2xl border border-ink-700/80 active:scale-[0.99]"
    >
      {/* La portada ampliada y difuminada hace de fondo: sin pedir otra imagen. */}
      {cover ? (
        <img
          src={cover}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full scale-110 object-cover opacity-50 blur-2xl saturate-150"
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-ink-900 via-ink-900/85 to-ink-900/40" />

      <div className="relative flex items-center gap-4 p-4">
        <CoverImage
          src={cover}
          alt={`Portada de ${title}`}
          title={title}
          className="aspect-[2/3] w-24 shrink-0 rounded-xl shadow-card"
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
            Destacada
          </span>
          <span className="line-clamp-3 text-[15px] font-semibold leading-snug text-ink-200">
            {title}
          </span>
          {rating !== null ? (
            <span className="flex items-center gap-1 text-xs font-medium text-accent">
              <Icon name="star" className="h-3.5 w-3.5" />
              {rating.toFixed(2)}
            </span>
          ) : null}
          <span className="line-clamp-2 text-[11px] leading-relaxed text-ink-400">
            {mangaDescription(manga)}
          </span>
          {tags.length > 0 ? (
            <span className="mt-0.5 flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-ink-700/80 px-2 py-0.5 text-[10px] text-ink-200"
                >
                  {tag}
                </span>
              ))}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
