import { Link } from 'react-router-dom';
import { coverUrl, mangaTitle } from '../api/mangadex';
import type { Manga, MangaStatistics } from '../api/types';
import CoverImage from './CoverImage';
import Icon from './Icon';

interface MangaCardProps {
  manga: Manga;
  stats?: MangaStatistics | undefined;
}

export default function MangaCard({ manga, stats }: MangaCardProps) {
  const title = mangaTitle(manga);
  const rating = stats?.rating.bayesian ?? stats?.rating.average ?? null;

  return (
    <Link
      to={`/manga/${manga.id}`}
      className="group flex flex-col gap-1.5 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="relative block">
        <CoverImage
          src={coverUrl(manga, 256)}
          alt={`Portada de ${title}`}
          title={title}
          className="aspect-[2/3] w-full rounded-xl shadow-card transition-transform group-hover:scale-[1.03]"
        />
        {rating !== null ? (
          <span className="absolute bottom-1 left-1 flex items-center gap-0.5 rounded-md bg-ink-900/85 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-accent backdrop-blur">
            <Icon name="star" className="h-3 w-3" />
            {rating.toFixed(1)}
          </span>
        ) : null}
      </span>
      {/* Alto fijo del título: si no, las tarjetas se desalinean según cuánto ocupe. */}
      <span className="line-clamp-2 min-h-[2.2rem] text-xs leading-snug text-ink-200">
        {title}
      </span>
    </Link>
  );
}
