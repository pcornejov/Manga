import { useCallback, useEffect } from 'react';
import type { FitMode, ReadingMode } from '../../db/schema';
import { useZoomPan } from '../../hooks/useZoomPan';
import PageImage from './PageImage';

interface PagedReaderProps {
  pages: string[];
  fallbackPages: string[];
  index: number;
  mode: Extract<ReadingMode, 'ltr' | 'rtl'>;
  fitMode: FitMode;
  onPrev: () => void;
  onNext: () => void;
  onToggleChrome: () => void;
}

/** Ancho de las zonas de tap laterales, como fracción de la pantalla. */
const SIDE_ZONE = 0.35;

/**
 * Lector paginado. En RTL el lado derecho avanza y el izquierdo retrocede,
 * que es como se lee el manga japonés.
 */
export default function PagedReader({
  pages,
  fallbackPages,
  index,
  mode,
  fitMode,
  onPrev,
  onNext,
  onToggleChrome,
}: PagedReaderProps) {
  const forward = mode === 'rtl' ? onPrev : onNext;
  const backward = mode === 'rtl' ? onNext : onPrev;

  const handleTap = useCallback(
    (x: number, _y: number, width: number) => {
      if (x < width * SIDE_ZONE) backward();
      else if (x > width * (1 - SIDE_ZONE)) forward();
      else onToggleChrome();
    },
    [backward, forward, onToggleChrome],
  );

  const handleSwipe = useCallback(
    (direction: 'left' | 'right') => {
      // Arrastrar hacia la izquierda mueve el contenido hacia allá: equivale a
      // tocar el lado derecho.
      if (direction === 'left') forward();
      else backward();
    },
    [backward, forward],
  );

  // El doble tap sólo hace zoom en la franja central: en los costados un tap es
  // siempre cambio de página, y pasar dos páginas seguidas no debe agrandar nada.
  const allowDoubleTapAt = useCallback(
    (x: number, width: number) => x >= width * SIDE_ZONE && x <= width * (1 - SIDE_ZONE),
    [],
  );

  const { ref, contentRef, css, reset } = useZoomPan({
    onTap: handleTap,
    onSwipe: handleSwipe,
    allowDoubleTapAt,
  });

  // Cada página arranca sin zoom y desde arriba: heredar el encuadre anterior
  // desorienta.
  useEffect(() => {
    reset();
  }, [index, fitMode, reset]);

  const url = pages[index];
  const fallbackUrl = fallbackPages[index] ?? url;

  return (
    <div
      ref={ref}
      className="flex h-screen w-full touch-none items-center justify-center overflow-hidden"
    >
      {url ? (
        <div ref={contentRef} style={{ transform: css }} className="origin-center will-change-transform">
          <PageImage
            url={url}
            fallbackUrl={fallbackUrl ?? url}
            fitMode={fitMode}
            pageNumber={index + 1}
            // Recién con la imagen pintada se conoce su alto real, que es lo que
            // decide dónde queda el tope de la página.
            onLoaded={reset}
          />
        </div>
      ) : null}
    </div>
  );
}
