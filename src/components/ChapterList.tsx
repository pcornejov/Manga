import { useCallback, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { chapterLabel, isReadable, volumeLabel } from '../api/mangadex';
import type { Chapter } from '../api/types';
import { type DownloadProgress, downloadChapter, removeDownload } from '../api/downloads';
import { clearProgress, saveProgress } from '../db';
import type { DownloadEntry, ProgressEntry } from '../db/schema';
import { useVirtualList } from '../hooks/useVirtualList';
import Icon from './Icon';

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
  coverUrl: string | null;
  chapters: Chapter[];
  progressByChapter: Map<string, ProgressEntry>;
  downloadedChapters: Map<string, DownloadEntry>;
  onDownloadsChange: () => void;
  onProgressChange: () => void;
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
        className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-700 text-[10px] tabular-nums text-ink-200"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        title={`Descargando ${state.done} de ${state.total}`}
      >
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(#f97316 ${percent * 3.6}deg, transparent 0deg)`,
            mask: 'radial-gradient(circle, transparent 58%, black 60%)',
            WebkitMask: 'radial-gradient(circle, transparent 58%, black 60%)',
          }}
        />
        {percent}
      </span>
    );
  }

  if (state?.kind === 'deleting') {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center text-[10px] text-ink-400">…</span>
    );
  }

  const error = state?.kind === 'error';

  // Icono y no una píldora con texto: con "Descargar" repetido en cada fila, el
  // botón pesaba más que el capítulo.
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
      title={
        error
          ? state.message
          : downloaded
            ? 'Descargado — tocar para borrar'
            : 'Descargar para leer sin conexión'
      }
      aria-label={downloaded ? 'Borrar descarga' : 'Descargar capítulo'}
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
        downloaded
          ? 'bg-accent/15 text-accent hover:bg-accent/25'
          : error
            ? 'bg-ink-700 text-accent'
            : 'text-ink-400 hover:bg-ink-700 hover:text-ink-200'
      }`}
    >
      <Icon name={downloaded ? 'check' : 'download'} className="h-4 w-4" />
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
  onToggleRead,
}: {
  chapter: Chapter;
  progress: ProgressEntry | undefined;
  downloaded: boolean;
  downloadState: DownloadState | undefined;
  onDownload: () => void;
  onDelete: () => void;
  onToggleRead: () => void;
}) {
  const readable = isReadable(chapter);
  const read = progress?.completed === true;
  const started = progress !== undefined && !read;

  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`truncate text-sm ${read ? 'text-ink-400' : 'text-ink-200'}`}
          title={chapterLabel(chapter)}
        >
          {chapterLabel(chapter)}
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <span>{chapter.attributes.translatedLanguage}</span>
          <span>·</span>
          <span>{chapter.attributes.pages} págs</span>
          {started ? (
            <>
              <span>·</span>
              <span className="text-accent">página {progress.page + 1}</span>
            </>
          ) : null}
        </span>
      </span>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onToggleRead();
        }}
        title={read ? 'Marcar como no leído' : 'Marcar como leído'}
        aria-label={read ? 'Marcar como no leído' : 'Marcar como leído'}
        aria-pressed={read}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors ${
          read ? 'text-accent hover:bg-ink-700' : 'text-ink-600 hover:bg-ink-700 hover:text-ink-400'
        }`}
      >
        <Icon name="check" className="h-4 w-4" />
      </button>
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

  const className = `flex h-[64px] items-center gap-2 border-b border-ink-700/60 px-3 ${
    read ? 'opacity-60' : ''
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
  coverUrl,
  chapters,
  progressByChapter,
  downloadedChapters,
  onDownloadsChange,
  onProgressChange,
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

  /** Marca o desmarca un capítulo sin tener que abrirlo. */
  const toggleRead = useCallback(
    async (chapter: Chapter) => {
      const actual = progressByChapter.get(chapter.id);
      if (actual?.completed) await clearProgress(chapter.id);
      else {
        await saveProgress({
          chapterId: chapter.id,
          mangaId,
          mangaTitle,
          coverUrl,
          page: Math.max(0, chapter.attributes.pages - 1),
          totalPages: chapter.attributes.pages,
          completed: true,
          chapterLabel: chapterLabel(chapter),
          updatedAt: Date.now(),
        });
      }
      onProgressChange();
    },
    [progressByChapter, mangaId, mangaTitle, coverUrl, onProgressChange],
  );

  /** Marca de una vez todo lo que se ve, para cuando ya venías leyendo en otro lado. */
  const markAllRead = useCallback(async () => {
    for (const chapter of ordered) {
      if (progressByChapter.get(chapter.id)?.completed) continue;
      await saveProgress({
        chapterId: chapter.id,
        mangaId,
        mangaTitle,
        coverUrl,
        page: Math.max(0, chapter.attributes.pages - 1),
        totalPages: chapter.attributes.pages,
        completed: true,
        chapterLabel: chapterLabel(chapter),
        updatedAt: Date.now(),
      });
    }
    onProgressChange();
  }, [ordered, progressByChapter, mangaId, mangaTitle, coverUrl, onProgressChange]);

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
      {ordered.some((chapter) => !progressByChapter.get(chapter.id)?.completed) ? (
        <button
          type="button"
          onClick={() => {
            void markAllRead();
          }}
          className="rounded bg-ink-700 px-3 py-1.5 text-xs text-ink-200 transition-colors hover:bg-ink-600"
        >
          Marcar todos como leídos
        </button>
      ) : null}
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
        className="flex h-[44px] items-center bg-ink-800/80 px-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400 backdrop-blur"
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
        onToggleRead={() => {
          void toggleRead(row.chapter);
        }}
      />
    );

  if (!virtualized) {
    return (
      <>
        {toolbar}
        <div className="overflow-hidden rounded-xl border border-ink-700">
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
        className="h-[70vh] overflow-y-auto rounded-xl border border-ink-700"
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
