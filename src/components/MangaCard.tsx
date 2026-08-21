import { Link } from 'react-router-dom';
import { coverUrl, mangaTitle } from '../api/mangadex';
import type { Manga } from '../api/types';
import CoverImage from './CoverImage';

export default function MangaCard({ manga }: { manga: Manga }) {
  const title = mangaTitle(manga);

  return (
    <Link
      to={`/manga/${manga.id}`}
      className="group flex flex-col gap-2 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <CoverImage
        src={coverUrl(manga, 256)}
        alt={`Portada de ${title}`}
        className="aspect-[2/3] w-full rounded-lg transition-transform group-hover:scale-[1.02]"
      />
      <span className="line-clamp-2 text-sm leading-snug text-ink-200">{title}</span>
    </Link>
  );
}
