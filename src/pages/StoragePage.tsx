import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { type StorageUsage, estimateStorage, formatBytes, removeDownload } from '../api/downloads';
import Spinner from '../components/Spinner';
import StateMessage from '../components/StateMessage';
import { getDownloads } from '../db';
import type { DownloadEntry } from '../db/schema';

export default function StoragePage() {
  const [downloads, setDownloads] = useState<DownloadEntry[] | null>(null);
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setDownloads(await getDownloads());
    setUsage(await estimateStorage());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      <Link to="/" className="mb-5 inline-block text-sm text-ink-400 hover:text-ink-200">
        ← Inicio
      </Link>
      <h1 className="mb-5 text-2xl font-semibold text-ink-200">Almacenamiento</h1>

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
        />
      ) : (
        <ul className="divide-y divide-ink-700 overflow-hidden rounded-lg border border-ink-700">
          {downloads.map((entry) => (
            <li key={entry.chapterId} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="flex min-w-0 flex-col">
                <Link
                  to={`/read/${entry.chapterId}`}
                  className="truncate text-sm text-ink-200 hover:text-accent"
                >
                  {entry.chapterLabel}
                </Link>
                <span className="text-xs text-ink-400">
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
                className="shrink-0 rounded bg-ink-700 px-3 py-1.5 text-xs text-ink-200 hover:bg-ink-600 disabled:opacity-50"
              >
                {deleting === entry.chapterId ? 'Borrando…' : 'Borrar'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
