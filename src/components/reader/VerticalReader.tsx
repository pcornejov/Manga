import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { FitMode } from '../../db/schema';
import PageImage from './PageImage';

interface VerticalReaderProps {
  pages: string[];
  fallbackPages: string[];
  index: number;
  fitMode: FitMode;
  onIndexChange: (index: number) => void;
  onToggleChrome: () => void;
  /** Se llama al insistir con el scroll estando ya al final del capítulo. */
  onReachEnd?: () => void;
}

/** Páginas por delante y por detrás que se montan (y por lo tanto se bajan). */
const WINDOW = 1;
/** Alto tentativo de una página todavía no montada, en fracción del ancho. */
const PLACEHOLDER_RATIO = 1.4;
/** Cuánto hay que seguir empujando más allá del final para encadenar. */
const OVERSCROLL_TO_CHAIN = 120;
const MIN_SCALE = 1;
const MAX_SCALE = 3;

/**
 * Lector continuo (webtoon).
 *
 * Sólo monta las páginas cercanas a la ventana: montar el capítulo entero
 * dispararía todas las descargas de una. Las que ya se montaron se quedan, así
 * el alto del documento no cambia debajo del scroll.
 */
export default function VerticalReader({
  pages,
  fallbackPages,
  index,
  fitMode,
  onIndexChange,
  onToggleChrome,
  onReachEnd,
}: VerticalReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const scrollingTo = useRef<number | null>(null);
  const [mounted, setMounted] = useState<Set<number>>(() => new Set([0]));

  // Montar la ventana alrededor de la página actual.
  useEffect(() => {
    setMounted((current) => {
      const next = new Set(current);
      let changed = false;
      for (let i = Math.max(0, index - WINDOW); i <= Math.min(pages.length - 1, index + WINDOW); i += 1) {
        if (!next.has(i)) {
          next.add(i);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [index, pages.length]);

  // Saltos de página pedidos desde afuera (teclado, barra, reanudar lectura).
  useEffect(() => {
    if (scrollingTo.current === index) return;
    const element = pageRefs.current[index];
    const container = scrollRef.current;
    if (!element || !container) return;
    const delta = element.offsetTop - container.scrollTop;
    // Sólo se salta si la página buscada no está ya a la vista.
    if (Math.abs(delta) < 8) return;
    scrollingTo.current = index;
    container.scrollTo({ top: element.offsetTop, behavior: 'auto' });
  }, [index]);

  /**
   * Teclado en el modo continuo.
   *
   * El contenedor de scroll no recibe el foco, así que el navegador no scrollea
   * solo: hay que moverlo a mano. Las flechas avanzan de a poco y espacio o
   * AvPág saltan casi una pantalla, que es lo que se espera al leer.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const container = scrollRef.current;
      if (!container) return;
      const pantalla = container.clientHeight;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          container.scrollBy({ top: pantalla * 0.25, behavior: 'smooth' });
          break;
        case 'ArrowUp':
          event.preventDefault();
          container.scrollBy({ top: -pantalla * 0.25, behavior: 'smooth' });
          break;
        case ' ':
        case 'PageDown':
          event.preventDefault();
          container.scrollBy({ top: pantalla * 0.9, behavior: 'smooth' });
          break;
        case 'PageUp':
          event.preventDefault();
          container.scrollBy({ top: -pantalla * 0.9, behavior: 'smooth' });
          break;
        case 'Home':
          event.preventDefault();
          container.scrollTo({ top: 0 });
          break;
        case 'End':
          event.preventDefault();
          container.scrollTo({ top: container.scrollHeight });
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    // Los extremos se resuelven exactos: son los que importan para el progreso y
    // para el botón de capítulo siguiente.
    if (container.scrollTop <= 4) {
      scrollingTo.current = null;
      onIndexChange(0);
      return;
    }
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) {
      scrollingTo.current = null;
      onIndexChange(pages.length - 1);
      return;
    }


    const position = container.scrollTop + container.clientHeight * 0.25;

    let current = 0;
    for (let i = 0; i < pageRefs.current.length; i += 1) {
      const element = pageRefs.current[i];
      if (element && element.offsetTop <= position) current = i;
      else break;
    }
    scrollingTo.current = null;
    onIndexChange(current);
  }, [onIndexChange, pages.length]);

  /**
   * Pinch para agrandar.
   *
   * Se cambia el ancho de la columna en vez de aplicar `transform`: así crecen
   * también `scrollWidth` y `scrollHeight`, y el scroll del navegador sigue
   * sirviendo en los dos ejes. Con `transform` habría que reimplementarlo.
   */
  const [scale, setScale] = useState(1);
  const pinch = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);

  const onPointerDown = useCallback((event: ReactPointerEvent) => {
    pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      if (a && b) {
        pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), scale };
      }
    }
  }, [scale]);

  const onPointerMove = useCallback((event: ReactPointerEvent) => {
    if (!pinch.current.has(event.pointerId)) return;
    pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current.size !== 2) return;

    const [a, b] = [...pinch.current.values()];
    const start = pinchStart.current;
    if (!a || !b || !start || start.distance === 0) return;
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const next = (start.scale * distance) / start.distance;
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent) => {
    pinch.current.delete(event.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
  }, []);

  // Encadenar por insistencia y no por tocar el fondo: llegar al final no puede
  // arrastrarte al capítulo siguiente sin que lo pidas.
  const overscroll = useRef(0);
  const handleWheel = useCallback(
    (event: { deltaY: number }) => {
      const container = scrollRef.current;
      if (!container || !onReachEnd) return;
      const atEnd =
        container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
      if (!atEnd || event.deltaY <= 0) {
        overscroll.current = 0;
        return;
      }
      overscroll.current += event.deltaY;
      if (overscroll.current >= OVERSCROLL_TO_CHAIN) {
        overscroll.current = 0;
        onReachEnd();
      }
    },
    [onReachEnd],
  );

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      onWheel={handleWheel}
      onClick={onToggleChrome}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // `touch-pan-x touch-pan-y` deja el scroll nativo en los dos ejes y a la vez
      // apaga el zoom del navegador, que se pelearía con el pinch propio.
      className="no-scrollbar h-screen w-full touch-pan-x touch-pan-y overflow-auto overscroll-contain"
    >
      <div
        className="mx-auto flex flex-col items-center"
        style={{ width: `${scale * 100}%`, maxWidth: scale > 1 ? 'none' : '48rem' }}
      >
        {pages.map((url, pageIndex) => (
          <div
            key={url}
            ref={(element) => {
              pageRefs.current[pageIndex] = element;
            }}
            className="w-full"
            style={
              mounted.has(pageIndex)
                ? undefined
                : { aspectRatio: `1 / ${PLACEHOLDER_RATIO}`, minHeight: '50vh' }
            }
          >
            {mounted.has(pageIndex) ? (
              <PageImage
                url={url}
                fallbackUrl={fallbackPages[pageIndex] ?? url}
                fitMode={fitMode === 'height' ? 'width' : fitMode}
                pageNumber={pageIndex + 1}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
