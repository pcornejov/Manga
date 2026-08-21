import { useCallback, useEffect, useRef, useState } from 'react';
import type { FitMode } from '../../db/schema';
import PageImage from './PageImage';

interface VerticalReaderProps {
  pages: string[];
  fallbackPages: string[];
  index: number;
  fitMode: FitMode;
  onIndexChange: (index: number) => void;
  onToggleChrome: () => void;
}

/** Páginas por delante y por detrás que se montan (y por lo tanto se bajan). */
const WINDOW = 1;
/** Alto tentativo de una página todavía no montada, en fracción del ancho. */
const PLACEHOLDER_RATIO = 1.4;

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

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      onClick={onToggleChrome}
      className="no-scrollbar h-screen w-full overflow-y-auto overscroll-contain"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center">
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
