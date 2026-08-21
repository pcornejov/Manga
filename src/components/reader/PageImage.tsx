import { useEffect, useState } from 'react';
import { forgetImage, loadImage } from '../../api/imageLoader';
import type { FitMode } from '../../db/schema';

interface PageImageProps {
  /** URL en calidad original. */
  url: string;
  /** URL comprimida, a la que se cae si la original falla dos veces. */
  fallbackUrl: string;
  fitMode: FitMode;
  pageNumber: number;
  onLoaded?: () => void;
}

/** Dos intentos con la calidad original antes de pasar a `dataSaver`. */
const MAX_ATTEMPTS = 2;

const FIT_CLASS: Record<FitMode, string> = {
  width: 'w-full h-auto',
  height: 'h-screen w-auto max-w-none',
  original: 'max-w-none w-auto h-auto',
};

/**
 * Una página del capítulo. Baja siempre por `loadImage`, que es lo que mantiene
 * el tope de tres imágenes en vuelo, y recién después la pinta.
 */
export default function PageImage({
  url,
  fallbackUrl,
  fitMode,
  pageNumber,
  onLoaded,
}: PageImageProps) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolved(null);
    setFailed(false);

    (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          await loadImage(url);
          if (!cancelled) setResolved(url);
          return;
        } catch {
          forgetImage(url);
        }
        if (cancelled) return;
      }

      // La calidad original no vino: se prueba la comprimida antes de rendirse.
      try {
        await loadImage(fallbackUrl);
        if (!cancelled) setResolved(fallbackUrl);
      } catch {
        forgetImage(fallbackUrl);
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, fallbackUrl]);

  if (failed) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center text-sm text-ink-400">
        No se pudo cargar la página {pageNumber}
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="flex min-h-[50vh] w-full items-center justify-center">
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-ink-600 border-t-accent"
          role="status"
          aria-label={`Cargando página ${pageNumber}`}
        />
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={`Página ${pageNumber}`}
      draggable={false}
      onLoad={onLoaded}
      className={`select-none object-contain ${FIT_CLASS[fitMode]}`}
    />
  );
}
