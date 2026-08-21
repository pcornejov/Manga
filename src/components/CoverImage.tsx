import { useEffect, useRef, useState } from 'react';
import { loadCover } from '../api/imageLoader';

interface CoverImageProps {
  src: string | null;
  alt: string;
  className?: string;
}

/** Reintentos antes de mostrar el hueco: el 403 del host es transitorio. */
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 800;
/** Margen para empezar a bajar la portada un poco antes de que se vea. */
const PRELOAD_MARGIN = '300px';

/**
 * Portada con carga diferida.
 *
 * Sólo se pide cuando está por entrar en pantalla, y siempre a través de la cola
 * de portadas: `uploads.mangadex.org` responde 403 si se le piden más de cinco
 * imágenes por segundo, que es justo lo que hace una grilla sin control.
 */
export default function CoverImage({ src, alt, className = '' }: CoverImageProps) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setVisible(false);
    setResolved(null);
    setFailed(false);
  }, [src]);

  useEffect(() => {
    const element = holderRef.current;
    if (!element || visible) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [visible, src]);

  useEffect(() => {
    if (!src || !visible) return;
    let cancelled = false;

    (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          await loadCover(src);
          if (!cancelled) setResolved(src);
          return;
        } catch {
          if (cancelled) return;
          // El 403 se pasa solo: esperar y volver a encolar alcanza.
          await new Promise((wait) => {
            setTimeout(wait, RETRY_BASE_MS * 2 ** attempt);
          });
        }
      }
      if (!cancelled) setFailed(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [src, visible]);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-ink-700 text-xs text-ink-400 ${className}`}
      >
        Sin portada
      </div>
    );
  }

  return (
    <div ref={holderRef} className={`bg-ink-700 ${className}`}>
      {resolved ? (
        <img
          src={resolved}
          alt={alt}
          decoding="async"
          className="h-full w-full animate-[fadeIn_.3s_ease-in] object-cover"
        />
      ) : null}
    </div>
  );
}
