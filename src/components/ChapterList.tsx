import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { chapterLabel, isReadable, volumeLabel } from '../api/mangadex';
import type { Chapter } from '../api/types';
import { type DownloadProgress, downloadChapter, removeDownload } from '../api/downloads';
import type { DownloadEntry, ProgressEntry } from '../db/schema';
import { useVirtualList } from '../hooks/useVirtualList';

/** Cuántos capítulos baja el botón de descarga múltiple. */
const BATCH_SIZE = 5;

/** A partir de acá la lista se virtualiza. */
const VIRTUALIZE_THRESHOLD = 200;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 64;

type Row =
  | { kind: 'header'; key: string; label: string; count: number }
  | { kind: 'chapter'; key: string; chapter: Chapter };

/** Estado de la descarga de un capítulo mientras está en curso. */
type DownloadState =
  | { kind: 'downloading'; done: number; total: number }
  | { kind: 'deleting' }
  | { kind: 'error'; message: string };

interface ChapterListProps {
  mangaId: string;
  mangaTitle: string;
  chapters: Chapter[];
  progressByChapter: Map<string, ProgressEntry>;
  downloadedChapters: Map<string, DownloadEntry>;
  onDownloadsChange: () => void;
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

function DownloadButton({
  downloaded,
  state,
  onDownload,
  onDelete,
}: {
  downloaded: boolean;
  state: DownloadState | undefined;
  onDownload: () => void;
  onDelete: () => void;
}) {
  if (state?.kind === 'downloading') {
    const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;
    return (
      <span
        className="relative w-24 shrink-0 overflow-hidden rounded bg-ink-700 px-2 py-1.5 text-center text-[11px] text-ink-200"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className="absolute inset-y-0 left-0 bg-accent/30 transition-[width] duration-200"
          style={{ width: `${percent}%` }}
        />
        <span className="relative">
          {state.done}/{state.total}
        </span>
      </span>
    );
  }

  if (state?.kind === 'deleting') {
    return <span className="w-24 shrink-0 text-center text-[11px] text-ink-400">Borrando…</span>;
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        // La fila entera es un enlace al lector: el botón no puede navegar.
        event.preventDefault();
        event.stopPropagation();
        if (downloaded) onDelete();
        else onDownload();
      }}
      title={state?.kind === 'error' ? state.message : undefined}
      className={`w-24 shrink-0 rounded px-2 py-1.5 text-[11px] transition-colors ${
        downloaded
          ? 'bg-accent/20 text-accent hover:bg-accent/30'
          : 'bg-ink-700 text-ink-200 hover:bg-ink-600'
      }`}
    >
      {state?.kind === 'error' ? 'Reintentar' : downloaded ? 'Descargado ✓' : 'Descargar'}
    </button>
  );
}

function ChapterRow({
  chapter,
  progress,
  downloaded,
  downloadState,
  onDownload,
  onDelete,
}: {
  chapter: Chapter;
  progress: ProgressEntry | undefined;
  downloaded: boolean;
  downloadState: DownloadState | undefined;
  onDownload: () => void;
  onDelete: () => void;
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
      {readable ? (
        <DownloadButton
          downloaded={downloaded}
          state={downloadState}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );

  const className = `flex h-[64px] items-center justify-between gap-3 border-b border-ink-700 px-4 ${
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

export default function ChapterList({
  mangaId,
  mangaTitle,
  chapters,
  progressByChapter,
  downloadedChapters,
  onDownloadsChange,
}: ChapterListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadState>>({});
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [batchRunning, setBatchRunning] = useState(false);

  // La lista llega ascendente; invertirla es lo que permite ir a lo último sin
  // recorrer 400 filas.
  const ordered = useMemo(
    () => (order === 'asc' ? chapters : [...chapters].reverse()),
    [chapters, order],
  );
  const rows = useMemo(() => buildRows(ordered), [ordered]);

  const setState = useCallback((chapterId: string, state: DownloadState | null) => {
    setDownloadStates((current) => {
      const next = { ...current };
      if (state) next[chapterId] = state;
      else delete next[chapterId];
      return next;
    });
  }, []);

  const startDownload = useCallback(
    (chapter: Chapter) => {
      setState(chapter.id, { kind: 'downloading', done: 0, total: chapter.attributes.pages });
      void downloadChapter(
        chapter.id,
        mangaId,
        mangaTitle,
        chapterLabel(chapter),
        (progress: DownloadProgress) => {
          setState(chapter.id, { kind: 'downloading', ...progress });
        },
      )
        .then(() => {
          setState(chapter.id, null);
          onDownloadsChange();
        })
        .catch((cause: unknown) => {
          setState(chapter.id, {
            kind: 'error',
            message: cause instanceof Error ? cause.message : 'Falló la descarga.',
          });
        });
    },
    [mangaId, mangaTitle, setState, onDownloadsChange],
  );

  const startDelete = useCallback(
    (chapterId: string) => {
      setState(chapterId, { kind: 'deleting' });
      void removeDownload(chapterId)
        .then(() => {
          setState(chapterId, null);
          onDownloadsChange();
        })
        .catch(() => {
          setState(chapterId, { kind: 'error', message: 'No se pudo borrar.' });
        });
    },
    [setState, onDownloadsChange],
  );
  const virtualized = rows.length > VIRTUALIZE_THRESHOLD;

  const itemHeight = (index: number): number =>
    rows[index]?.kind === 'header' ? HEADER_HEIGHT : ROW_HEIGHT;

  const { totalHeight, startIndex, endIndex, offsetTop } = useVirtualList(scrollRef, {
    itemCount: virtualized ? rows.length : 0,
    itemHeight,
  });

  /** Baja de a uno los próximos capítulos que falten, en el orden que se ve. */
  const downloadBatch = useCallback(async () => {
    const pendientes = ordered
      .filter((chapter) => isReadable(chapter) && !downloadedChapters.has(chapter.id))
      .slice(0, BATCH_SIZE);
    if (pendientes.length === 0) return;

    setBatchRunning(true);
    for (const chapter of pendientes) {
      setState(chapter.id, { kind: 'downloading', done: 0, total: chapter.attributes.pages });
      try {
        await downloadChapter(
          chapter.id,
          mangaId,
          mangaTitle,
          chapterLabel(chapter),
          (progress: DownloadProgress) => {
            setState(chapter.id, { kind: 'downloading', ...progress });
          },
        );
        setState(chapter.id, null);
        onDownloadsChange();
      } catch (cause) {
        setState(chapter.id, {
          kind: 'error',
          message: cause instanceof Error ? cause.message : 'Falló la descarga.',
        });
        break;
      }
    }
    setBatchRunning(false);
  }, [ordered, downloadedChapters, mangaId, mangaTitle, setState, onDownloadsChange]);

  const pendientesCount = ordered.filter(
    (chapter) => isReadable(chapter) && !downloadedChapters.has(chapter.id),
  ).length;

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
        }}
        className="rounded bg-ink-700 px-3 py-1.5 text-xs text-ink-200 transition-colors hover:bg-ink-600"
      >
        {order === 'asc' ? 'Del primero al último ↓' : 'Del último al primero ↑'}
      </button>
      {pendientesCount > 0 ? (
        <button
          type="button"
          disabled={batchRunning}
          onClick={() => {
            void downloadBatch();
          }}
          className="rounded bg-ink-700 px-3 py-1.5 text-xs text-ink-200 transition-colors hover:bg-ink-600 disabled:opacity-50"
        >
          {batchRunning
            ? 'Descargando…'
            : `Descargar ${Math.min(BATCH_SIZE, pendientesCount)} siguientes`}
        </button>
      ) : null}
    </div>
  );

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
        downloaded={downloadedChapters.has(row.chapter.id)}
        downloadState={downloadStates[row.chapter.id]}
        onDownload={() => {
          startDownload(row.chapter);
        }}
        onDelete={() => {
          startDelete(row.chapter.id);
        }}
      />
    );

  if (!virtualized) {
    return (
      <>
        {toolbar}
        <div className="overflow-hidden rounded-lg border border-ink-700">
          {rows.map(renderRow)}
        </div>
      </>
    );
  }

  return (
    <>
      {toolbar}
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
    </>
  );
}
