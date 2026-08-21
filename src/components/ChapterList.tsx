import { useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { chapterLabel, isReadable, volumeLabel } from '../api/mangadex';
import type { Chapter } from '../api/types';
import { useVirtualList } from '../hooks/useVirtualList';
import type { ProgressEntry } from '../db/schema';

/** A partir de acá la lista se virtualiza. */
const VIRTUALIZE_THRESHOLD = 200;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 60;

type Row =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'chapter'; key: string; chapter: Chapter };

interface ChapterListProps {
  chapters: Chapter[];
  progressByChapter: Map<string, ProgressEntry>;
}

/** Aplana los capítulos a filas: un encabezado por volumen y una fila por capítulo. */
function buildRows(chapters: Chapter[]): Row[] {
  const groups = new Map<string, Chapter[]>();
  for (const chapter of chapters) {
    const label = volumeLabel(chapter);
    const group = groups.get(label);
    if (group) group.push(chapter);
    else groups.set(label, [chapter]);
  }

  const rows: Row[] = [];
  for (const [label, group] of groups) {
    rows.push({ kind: 'header', key: `h:${label}`, label, count: group.length });
    for (const chapter of group) rows.push({ kind: 'chapter', key: chapter.id, chapter });
  }
  return rows;
}

function ChapterRow({
  chapter,
  progress,
}: {
  chapter: Chapter;
  progress: ProgressEntry | undefined;
}) {
  const readable = isReadable(chapter);
  const read = progress?.completed === true;
  const started = progress !== undefined && !read;

  const content = (
    <>
      <span className="flex min-w-0 flex-col">
        <span
          className={`truncate text-sm ${read ? 'text-ink-400' : 'text-ink-200'}`}
          title={chapterLabel(chapter)}
        >
          {chapterLabel(chapter)}
        </span>
        <span className="text-xs text-ink-400">
          {chapter.attributes.translatedLanguage} · {chapter.attributes.pages} págs
          {started ? ` · en la página ${progress.page + 1}` : ''}
        </span>
      </span>
      {read ? (
        <span className="shrink-0 rounded-full bg-ink-600 px-2 py-0.5 text-[11px] text-ink-200">
          Leído
        </span>
      ) : null}
      {started ? (
        <span className="shrink-0 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] text-accent">
          Seguir
        </span>
      ) : null}
    </>
  );

  const className = `flex h-[60px] items-center justify-between gap-3 border-b border-ink-700 px-4 ${
    read ? 'bg-ink-800/40' : ''
  }`;

  if (!readable) {
    return (
      <div className={`${className} opacity-50`} title="Capítulo no disponible en MangaDex">
        {content}
      </div>
    );
  }

  return (
    <Link
      to={`/read/${chapter.id}`}
      className={`${className} transition-colors hover:bg-ink-700 focus-visible:bg-ink-700 focus-visible:outline-none`}
    >
      {content}
    </Link>
  );
}

export default function ChapterList({ chapters, progressByChapter }: ChapterListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => buildRows(chapters), [chapters]);
  const virtualized = rows.length > VIRTUALIZE_THRESHOLD;

  const itemHeight = (index: number): number =>
    rows[index]?.kind === 'header' ? HEADER_HEIGHT : ROW_HEIGHT;

  const { totalHeight, startIndex, endIndex, offsetTop } = useVirtualList(scrollRef, {
    itemCount: virtualized ? rows.length : 0,
    itemHeight,
  });

  const renderRow = (row: Row) =>
    row.kind === 'header' ? (
      <div
        key={row.key}
        className="flex h-[44px] items-center bg-ink-800 px-4 text-xs font-semibold uppercase tracking-wide text-ink-400"
      >
        {row.label}
        <span className="ml-2 font-normal normal-case">({row.count})</span>
      </div>
    ) : (
      <ChapterRow
        key={row.key}
        chapter={row.chapter}
        progress={progressByChapter.get(row.chapter.id)}
      />
    );

  if (!virtualized) {
    return (
      <div className="overflow-hidden rounded-lg border border-ink-700">
        {rows.map(renderRow)}
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="h-[70vh] overflow-y-auto rounded-lg border border-ink-700"
      // Contenedor propio de scroll: sin esto la ventana virtual no tiene con qué medirse.
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetTop}px)` }}>
          {rows.slice(startIndex, endIndex).map(renderRow)}
        </div>
      </div>
    </div>
  );
}
