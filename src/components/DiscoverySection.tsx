import { useEffect, useState } from 'react';
import { hasReadableChapters } from '../api/mangadex';
import type { Manga } from '../api/types';
import MangaCard from './MangaCard';
import Spinner from './Spinner';
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

/**
 * Fila de obras para descubrir. Las que no se pueden leer en la app se van
 * cayendo a medida que se comprueban, así la sección aparece enseguida en vez de
 * esperar a verificarlas todas.
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

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold text-ink-200">{title}</h2>
      {loading ? (
        <Spinner />
      ) : failed ? (
        <StateMessage title="No se pudo cargar esta sección" />
      ) : visible.length === 0 ? (
        <StateMessage title="Nada para mostrar acá" detail={emptyDetail} />
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6">
          {visible.map((manga) => (
            <MangaCard key={manga.id} manga={manga} />
          ))}
        </div>
      )}
    </section>
  );
}
