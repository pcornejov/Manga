import { useEffect, useRef, useState } from 'react';
import { ImageLoadError, loadCover } from '../api/imageLoader';
import Icon from './Icon';

interface CoverImageProps {
  src: string | null;
  alt: string;
  /** Se usa para dibujar la inicial cuando no hay portada. */
  title?: string;
  className?: string;
}

/** Reintentos ante fallos pasajeros. Un rechazo del servidor no se reintenta. */
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
export default function CoverImage({ src, alt, title, className = '' }: CoverImageProps) {
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
        } catch (cause) {
          if (cancelled) return;
          // Un 403/429 significa que el servidor nos está frenando: insistir es
          // justo lo que escala a un bloqueo permanente.
          if (cause instanceof ImageLoadError && cause.rejected) break;
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

  // Sin portada se dibuja la inicial: un bloque gris vacío se lee como un error,
  // una inicial se lee como una obra.
  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-ink-700 to-ink-800 text-ink-400 ${className}`}
        title={title ?? alt}
      >
        {title ? (
          <span className="text-xl font-semibold text-ink-400/80">
            {title.trim().charAt(0).toUpperCase()}
          </span>
        ) : (
          <Icon name="book" className="h-6 w-6" />
        )}
      </div>
    );
  }

  return (
    <div ref={holderRef} className={`overflow-hidden bg-ink-700 ${className}`}>
      {resolved ? (
        <img
          src={resolved}
          alt={alt}
          decoding="async"
          className="h-full w-full animate-[fadeIn_.3s_ease-in] object-cover"
        />
      ) : (
        <div className="h-full w-full animate-pulse bg-ink-700" />
      )}
    </div>
  );
}
