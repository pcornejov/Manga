import { useEffect, useState } from 'react';
import { countReadableChapters, getMangaByIds } from '../api/mangadex';
import { followManga } from '../db';
import type { LibraryEntry } from '../db/schema';

/**
 * Cuántos capítulos nuevos tiene cada obra seguida desde la última vez que se
 * abrió su ficha.
 *
 * Primero se pregunta por todas juntas cuál es su último capítulo subido: eso es
 * un atributo de la obra, así que sale en un solo pedido. Sólo para las que
 * cambiaron se cuenta cuántos hay ahora, que es un pedido más por obra.
 */
export function useLibraryUpdates(library: LibraryEntry[]): Map<string, number> {
  const [updates, setUpdates] = useState<Map<string, number>>(new Map());
  const key = library.map((entry) => entry.mangaId).join(',');

  useEffect(() => {
    if (library.length === 0) return;
    const controller = new AbortController();

    (async () => {
      const current = await getMangaByIds(
        library.map((entry) => entry.mangaId),
        controller.signal,
      );
      const latestById = new Map(
        current.map((manga) => [manga.id, manga.attributes.latestUploadedChapter]),
      );

      const found = new Map<string, number>();
      for (const entry of library) {
        const latest = latestById.get(entry.mangaId) ?? null;

        // Sin referencia previa no se puede decir qué es nuevo: se guarda la foto
        // actual y a partir de la próxima vez sí hay con qué comparar.
        if (entry.latestChapterId === undefined) {
          const count = await countReadableChapters(entry.mangaId, controller.signal);
          await followManga({ ...entry, latestChapterId: latest, chapterCount: count });
          continue;
        }

        if (latest === entry.latestChapterId) continue;

        const count = await countReadableChapters(entry.mangaId, controller.signal);
        const nuevos = count - (entry.chapterCount ?? count);
        if (nuevos > 0) found.set(entry.mangaId, nuevos);
      }

      if (!controller.signal.aborted) setUpdates(found);
    })().catch(() => undefined);

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return updates;
}
