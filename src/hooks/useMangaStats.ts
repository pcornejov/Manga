import { useEffect, useState } from 'react';
import { getStatistics } from '../api/mangadex';
import type { MangaStatistics } from '../api/types';

/**
 * Puntuación y seguidores de un conjunto de obras.
 *
 * Pide en lote y devuelve lo que haya: la grilla se pinta primero y las notas
 * aparecen encima cuando llegan, sin trabar el render.
 */
export function useMangaStats(ids: string[]): Map<string, MangaStatistics> {
  const [stats, setStats] = useState<Map<string, MangaStatistics>>(new Map());
  // Clave estable: sin esto el efecto se dispararía en cada render.
  const key = ids.join(',');

  useEffect(() => {
    if (ids.length === 0) return;
    const controller = new AbortController();

    getStatistics(ids, controller.signal)
      .then((found) => {
        if (!controller.signal.aborted) setStats(found);
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return stats;
}
