import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { type StorageUsage, estimateStorage, formatBytes, removeDownload } from '../api/downloads';
import PageHeader from '../components/PageHeader';
import Spinner from '../components/Spinner';
import StateMessage from '../components/StateMessage';
import { getDownloads } from '../db';
import type { DownloadEntry } from '../db/schema';

export default function StoragePage() {
  const [downloads, setDownloads] = useState<DownloadEntry[] | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  /** Una obra por grupo, en el orden en que se descargaron. */
  const agrupadas = new Map<string, DownloadEntry[]>();
  for (const entry of downloads ?? []) {
    const grupo = agrupadas.get(entry.mangaId);
    if (grupo) grupo.push(entry);
    else agrupadas.set(entry.mangaId, [entry]);
  }

  const borrarObra = useCallback(
    async (chapterIds: string[]) => {
      setDeleting(chapterIds[0] ?? null);
      for (const id of chapterIds) await removeDownload(id);
      setDeleting(null);
      await refreshRef.current();
    },
    [],
  );

  const refresh = useCallback(async () => {
    setDownloads(await getDownloads());
    setUsage(await estimateStorage());
  }, []);

  // Ref para que `borrarObra` no dependa de `refresh` y se redefina en cada render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-safe-nav">
      <PageHeader title="Descargas" />

      {usage ? (
        <dl className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-ink-700 p-3">
            <dt className="text-xs text-ink-400">Capítulos descargados</dt>
            <dd className="text-lg text-ink-200">{usage.chapters}</dd>
          </div>
          <div className="rounded-lg border border-ink-700 p-3">
            <dt className="text-xs text-ink-400">Ocupan</dt>
            <dd className="text-lg text-ink-200">{formatBytes(usage.downloadedBytes)}</dd>
          </div>
          {usage.usedBytes !== null ? (
            <div className="rounded-lg border border-ink-700 p-3">
              <dt className="text-xs text-ink-400">Total del sitio</dt>
              <dd className="text-lg text-ink-200">
                {formatBytes(usage.usedBytes)}
                {usage.quotaBytes !== null ? (
                  <span className="text-sm text-ink-400"> de {formatBytes(usage.quotaBytes)}</span>
                ) : null}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {downloads === null ? (
        <Spinner label="Leyendo lo guardado…" />
      ) : downloads.length === 0 ? (
        <StateMessage
          title="No hay capítulos descargados"
          detail="Desde la ficha de una obra podés descargar capítulos para leerlos sin conexión."
          icon="download"
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {[...agrupadas.entries()].map(([mangaId, entradas]) => {
            const bytes = entradas.reduce((total, entrada) => total + entrada.bytes, 0);
            return (
              <li key={mangaId} className="overflow-hidden rounded-xl border border-ink-700">
                <div className="flex items-center justify-between gap-3 bg-ink-800/80 px-4 py-2.5">
                  <Link
                    to={`/manga/${mangaId}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-ink-200 hover:text-accent"
                  >
                    {entradas[0]?.mangaTitle || 'Obra desconocida'}
                  </Link>
                  <span className="shrink-0 text-[11px] tabular-nums text-ink-400">
                    {entradas.length} · {formatBytes(bytes)}
                  </span>
                  <button
                    type="button"
                    disabled={deleting !== null}
                    onClick={() => {
                      void borrarObra(entradas.map((entrada) => entrada.chapterId));
                    }}
                    className="shrink-0 rounded px-2 py-1 text-[11px] text-ink-400 hover:text-accent disabled:opacity-50"
                  >
                    Borrar todo
                  </button>
                </div>

                <ul className="divide-y divide-ink-700/60">
                  {entradas.map((entry) => (
                    <li
                      key={entry.chapterId}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="flex min-w-0 flex-col">
                        <Link
                          to={`/read/${entry.chapterId}`}
                          className="truncate text-sm text-ink-200 hover:text-accent"
                        >
                          {entry.chapterLabel}
                        </Link>
                        <span className="text-[11px] text-ink-400">
                          {entry.urls.length} páginas · {formatBytes(entry.bytes)}
                        </span>
                      </span>
                      <button
                        type="button"
                        disabled={deleting === entry.chapterId}
                        onClick={() => {
                          setDeleting(entry.chapterId);
                          void removeDownload(entry.chapterId)
                            .then(refresh)
                            .finally(() => {
                              setDeleting(null);
                            });
                        }}
                        className="shrink-0 rounded bg-ink-700 px-3 py-1.5 text-[11px] text-ink-200 hover:bg-ink-600 disabled:opacity-50"
                      >
                        {deleting === entry.chapterId ? 'Borrando…' : 'Borrar'}
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
