import { useCallback, useEffect, useRef, useState } from 'react';
import { browse, hasReadableChapters, type BrowseFilter } from '../api/mangadex';
import type { Manga } from '../api/types';
import { useMangaStats } from '../hooks/useMangaStats';
import MangaCard from './MangaCard';
import Spinner from './Spinner';
import StateMessage from './StateMessage';

/** Cuántas obras trae cada pedido. */
const PAGE_SIZE = 24;
/**
 * De a cuántas se verifica antes de pintar.
 *
 * Verificar cuesta un pedido por obra y la cola global admite cinco por segundo:
 * comprobar las veinticuatro de una dejaba cinco segundos de esqueletos. Nueve
 * es lo que entra en una pantalla de tres columnas, así que la primera tanda
 * aparece enseguida y el resto va cayendo debajo.
 */
const VERIFY_CHUNK = 9;

interface CollectionGridProps {
  title: string;
  filtro: BrowseFilter;
  /**
   * Comprueba obra por obra que se pueda abrir antes de mostrarla. Cuesta un
   * pedido por obra, así que sólo vale donde hay mucho licenciado.
   */
  verify?: boolean;
  emptyDetail?: string;
}

/** Huecos del alto de una tarjeta, para que la grilla no salte al llegar los datos. */
function Skeleton({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="shimmer aspect-[2/3] w-full rounded-xl" />
          <div className="shimmer mt-2 h-3 w-4/5 rounded" />
        </div>
      ))}
    </>
  );
}

/**
 * Grilla de una colección, que crece al llegar al final.
 *
 * Va en grilla y no en carrusel porque acá se viene a recorrer: con la fila
 * horizontal había que arrastrar veinte veces para ver lo mismo que entra en dos
 * pantallas de scroll.
 */
export default function CollectionGrid({
  title,
  filtro,
  verify = false,
  emptyDetail,
}: CollectionGridProps) {
  const [items, setItems] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [agotado, setAgotado] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  /** Cuántas obras se pidieron ya, incluidas las que la verificación descartó. */
  const pedidas = useRef(0);
  const enCurso = useRef(false);
  const abort = useRef<AbortController | null>(null);

  const cargar = useCallback(async () => {
    if (enCurso.current || agotado || failed) return;
    enCurso.current = true;
    setLoading(true);

    const controller = abort.current ?? new AbortController();
    abort.current = controller;

    try {
      const { items: pagina, total } = await browse(
        filtro,
        pedidas.current,
        controller.signal,
        PAGE_SIZE,
      );
      if (controller.signal.aborted) return;

      pedidas.current += pagina.length;

      // Se verifica antes de pintar y no después: en una grilla vertical, las
      // tarjetas desapareciendo bajo el pulgar mueven todo lo que está debajo.
      // Se agrega al final, así lo ya pintado no se mueve.
      if (verify) {
        for (let i = 0; i < pagina.length; i += VERIFY_CHUNK) {
          const utiles = await soloLeibles(pagina.slice(i, i + VERIFY_CHUNK), controller.signal);
          if (controller.signal.aborted) return;
          setItems((current) => [...current, ...utiles]);
        }
      } else {
        setItems((current) => [...current, ...pagina]);
      }
      // El propio observador vuelve a disparar si la página rindió poco: el
      // centinela sigue a la vista y pide la siguiente sola.
      setAgotado(pagina.length === 0 || pedidas.current >= total);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      enCurso.current = false;
    }
  }, [filtro, verify, agotado, failed]);

  // Al cambiar de colección se empieza de cero: el componente se reusa entre
  // atajos y géneros.
  useEffect(() => {
    abort.current?.abort();
    abort.current = new AbortController();
    pedidas.current = 0;
    enCurso.current = false;
    setItems([]);
    setAgotado(false);
    setFailed(false);
    setLoading(true);
    return () => {
      abort.current?.abort();
    };
  }, [filtro]);

  useEffect(() => {
    const nodo = sentinel.current;
    if (!nodo || agotado || failed) return;

    // Con margen, para que la página siguiente ya esté cuando se llega abajo.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void cargar();
      },
      { rootMargin: '600px' },
    );
    observer.observe(nodo);
    return () => {
      observer.disconnect();
    };
  }, [cargar, agotado, failed]);

  const stats = useMangaStats(items.map((manga) => manga.id));
  const vacio = !loading && items.length === 0;

  return (
    <section className="mb-7">
      <h2 className="section-title">
        {title}
        {items.length > 0 ? (
          <span className="ml-1 font-normal normal-case tracking-normal">({items.length})</span>
        ) : null}
      </h2>

      {failed && items.length === 0 ? (
        <StateMessage title="No se pudo cargar esta selección" />
      ) : vacio ? (
        <StateMessage title="Nada para mostrar acá" detail={emptyDetail} />
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {items.map((manga) => (
            <MangaCard key={manga.id} manga={manga} stats={stats.get(manga.id)} />
          ))}
          {loading ? <Skeleton count={items.length === 0 ? 9 : 3} /> : null}
        </div>
      )}

      {/* El centinela vive fuera de la grilla: dentro contaría como una celda. */}
      <div ref={sentinel} aria-hidden className="h-1" />

      {agotado && items.length > 0 ? (
        <p className="mt-4 text-center text-xs text-ink-400">No hay más obras acá.</p>
      ) : null}
      {failed && items.length > 0 ? (
        <p className="mt-4 text-center text-xs text-ink-400">
          No se pudieron traer más obras. Probá de nuevo en un rato.
        </p>
      ) : null}
      {loading && items.length > 0 ? <Spinner label="Trayendo más…" /> : null}
    </section>
  );
}

/** Deja sólo las obras con algún capítulo que la app pueda abrir. */
async function soloLeibles(items: Manga[], signal: AbortSignal): Promise<Manga[]> {
  const banderas = await Promise.all(
    // Ante un fallo se deja pasar: es preferible una obra de más que un hueco
    // por un error de red.
    items.map((manga) => hasReadableChapters(manga.id, signal).catch(() => true)),
  );
  return items.filter((_, index) => banderas[index] === true);
}
