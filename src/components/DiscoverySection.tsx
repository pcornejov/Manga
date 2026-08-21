import { useEffect, useState } from 'react';
import { hasReadableChapters } from '../api/mangadex';
import type { Manga } from '../api/types';
import { useMangaStats } from '../hooks/useMangaStats';
import MangaCard from './MangaCard';
import StateMessage from './StateMessage';

interface DiscoverySectionProps {
  title: string;
  load: (signal: AbortSignal) => Promise<Manga[]>;
  /**
   * En `true` se comprueba obra por obra que tenga capítulos leíbles. Las
   * novedades ya vienen garantizadas por el filtro del listado de capítulos, así
   * que ahí se puede saltear.
   */
  verify?: boolean;
  max?: number;
  emptyDetail?: string;
}

/** Huecos del ancho de una tarjeta, para que la fila no salte al llegar los datos. */
function Skeleton() {
  return (
    <div className="flex gap-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="w-[7.5rem] shrink-0">
          <div className="shimmer aspect-[2/3] w-full rounded-xl" />
          <div className="shimmer mt-2 h-3 w-4/5 rounded" />
        </div>
      ))}
    </div>
  );
}

/**
 * Fila de obras para descubrir.
 *
 * Va en carrusel horizontal y no en grilla: en el teléfono, tres secciones en
 * grilla dejaban la tercera a dos pantallas de scroll. Las obras que no se pueden
 * leer se van cayendo a medida que se comprueban, así la fila aparece enseguida.
 */
export default function DiscoverySection({
  title,
  load,
  verify = false,
  max = 18,
  emptyDetail,
}: DiscoverySectionProps) {
  const [items, setItems] = useState<Manga[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    setHidden(new Set());

    load(controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return;
        setItems(found);
        setLoading(false);
        if (!verify) return;

        for (const manga of found) {
          void hasReadableChapters(manga.id, controller.signal)
            .then((readable) => {
              if (readable || controller.signal.aborted) return;
              setHidden((current) => new Set(current).add(manga.id));
            })
            .catch(() => undefined);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [load, verify]);

  const visible = items.filter((manga) => !hidden.has(manga.id)).slice(0, max);
  const stats = useMangaStats(visible.map((manga) => manga.id));

  return (
    <section className="mb-7">
      <h2 className="section-title">{title}</h2>
      {loading ? (
        <Skeleton />
      ) : failed ? (
        <StateMessage title="No se pudo cargar esta sección" />
      ) : visible.length === 0 ? (
        <StateMessage title="Nada para mostrar acá" detail={emptyDetail} />
      ) : (
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
          {visible.map((manga) => (
            <div key={manga.id} className="w-[7.5rem] shrink-0 snap-start">
              <MangaCard manga={manga} stats={stats.get(manga.id)} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
