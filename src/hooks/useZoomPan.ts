import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

export interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

const MIN_SCALE = 1;
const MAX_SCALE = 5;
/** Zoom al que salta el doble tap. */
const DOUBLE_TAP_SCALE = 2.5;

const TAP_MAX_MS = 250;
const TAP_MAX_MOVE_PX = 10;
const DOUBLE_TAP_MAX_MS = 300;
/** Dos taps lejos uno del otro son dos taps, no un doble tap. */
const DOUBLE_TAP_MAX_DISTANCE_PX = 40;
const SWIPE_MIN_PX = 60;
const SWIPE_MAX_MS = 800;

interface PointerState {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startedAt: number;
}

interface UseZoomPanOptions {
  /** Tap corto sin desplazamiento. Las coordenadas son relativas al elemento. */
  onTap?: (x: number, y: number, width: number) => void;
  /** Arrastre horizontal rápido con la imagen sin zoom. */
  onSwipe?: (direction: 'left' | 'right') => void;
  /**
   * Zonas donde el doble tap hace zoom. Devolver `false` en las zonas de
   * navegación evita que pasar páginas rápido termine agrandando la imagen.
   */
  allowDoubleTapAt?: (x: number, width: number) => boolean;
  /** En `false` no se escuchan gestos (modo continuo: scrollea el navegador). */
  enabled?: boolean;
}

interface UseZoomPanResult {
  /** Contenedor: acá se escuchan los gestos y contra esto se miden los límites. */
  ref: RefObject<HTMLDivElement>;
  /** Elemento transformado; su tamaño define hasta dónde se puede desplazar. */
  contentRef: RefObject<HTMLDivElement>;
  transform: Transform;
  /** Valor listo para `style.transform`. */
  css: string;
  reset: () => void;
  zoomBy: (factor: number) => void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/**
 * Zoom y desplazamiento con Pointer Events y matriz propia.
 *
 * El pinch nativo del navegador se pelea con los gestos de cambio de página, así
 * que el contenedor va con `touch-action: none` y acá se reimplementa todo:
 * pinch a dos dedos, arrastre a uno (sólo con zoom), doble tap y ctrl+rueda.
 */
export function useZoomPan({
  onTap,
  onSwipe,
  allowDoubleTapAt,
  enabled = true,
}: UseZoomPanOptions = {}): UseZoomPanResult {
  const ref = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState<Transform>(IDENTITY);

  // Los gestos se calculan sobre refs porque los listeners nativos no ven el
  // estado de React al momento del evento.
  const transformRef = useRef<Transform>(IDENTITY);
  const pointers = useRef(new Map<number, PointerState>());
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);
  const lastTap = useRef<{ at: number; x: number; y: number } | null>(null);

  /**
   * Cuánto se puede correr el contenido en un eje sin dejar huecos.
   *
   * El contenido está centrado, así que con tamaño escalado `content` dentro de
   * un contenedor `container` el desplazamiento válido es ±(content-container)/2.
   * Si entra entero, no hay nada que correr.
   */
  const panLimit = (container: number, content: number): number =>
    Math.max(0, (content - container) / 2);

  const apply = useCallback((next: Transform) => {
    const scale = clamp(next.scale, MIN_SCALE, MAX_SCALE);
    const container = ref.current;
    const content = contentRef.current;

    if (!container || !content) {
      transformRef.current = { ...next, scale };
      setTransform(transformRef.current);
      return;
    }

    const limitX = panLimit(container.clientWidth, content.offsetWidth * scale);
    const limitY = panLimit(container.clientHeight, content.offsetHeight * scale);
    const value: Transform = {
      scale,
      x: clamp(next.x, -limitX, limitX),
      y: clamp(next.y, -limitY, limitY),
    };
    transformRef.current = value;
    setTransform(value);
  }, []);

  /**
   * Si el contenido se sale de la pantalla en un eje, hay que poder correrlo por
   * ahí aunque no haya zoom: con ajuste a lo ancho una página es más alta que la
   * pantalla y su parte de abajo quedaría inaccesible.
   */
  const overflow = useCallback((): { x: boolean; y: boolean } => {
    const container = ref.current;
    const content = contentRef.current;
    if (!container || !content) {
      const zoomed = transformRef.current.scale > 1;
      return { x: zoomed, y: zoomed };
    }
    const scale = transformRef.current.scale;
    return {
      x: content.offsetWidth * scale > container.clientWidth + 1,
      y: content.offsetHeight * scale > container.clientHeight + 1,
    };
  }, []);

  /** Escala alrededor de un punto del elemento, que queda fijo. */
  const scaleAround = useCallback(
    (nextScale: number, focalX: number, focalY: number) => {
      const current = transformRef.current;
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
      const ratio = scale / current.scale;
      apply({
        scale,
        x: focalX - (focalX - current.x) * ratio,
        y: focalY - (focalY - current.y) * ratio,
      });
    },
    [apply],
  );

  /**
   * Vuelve al tamaño original, arriba de todo. Si la página entra entera queda
   * centrada; si es más alta que la pantalla, empieza por el principio, que es
   * por donde se lee.
   */
  const reset = useCallback(() => {
    const container = ref.current;
    const content = contentRef.current;
    const top = container && content ? panLimit(container.clientHeight, content.offsetHeight) : 0;
    apply({ scale: 1, x: 0, y: top });
  }, [apply]);

  const zoomBy = useCallback(
    (factor: number) => {
      const element = ref.current;
      const width = element?.clientWidth ?? 0;
      const height = element?.clientHeight ?? 0;
      scaleAround(transformRef.current.scale * factor, width / 2, height / 2);
    },
    [scaleAround],
  );

  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;

    const localPoint = (event: PointerEvent): { x: number; y: number } => {
      const rect = element.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const distanceBetween = (a: PointerState, b: PointerState): number =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const handleDown = (event: PointerEvent): void => {
      const point = localPoint(event);
      element.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, {
        ...point,
        startX: point.x,
        startY: point.y,
        startedAt: Date.now(),
      });

      if (pointers.current.size === 2) {
        const [first, second] = [...pointers.current.values()];
        if (first && second) {
          pinchStart.current = {
            distance: distanceBetween(first, second),
            scale: transformRef.current.scale,
          };
        }
      }
    };

    const handleMove = (event: PointerEvent): void => {
      const tracked = pointers.current.get(event.pointerId);
      if (!tracked) return;
      const point = localPoint(event);
      const deltaX = point.x - tracked.x;
      const deltaY = point.y - tracked.y;
      pointers.current.set(event.pointerId, { ...tracked, ...point });

      if (pointers.current.size === 2) {
        event.preventDefault();
        const [first, second] = [...pointers.current.values()];
        const start = pinchStart.current;
        if (!first || !second || !start || start.distance === 0) return;
        const distance = distanceBetween(first, second);
        scaleAround(
          (start.scale * distance) / start.distance,
          (first.x + second.x) / 2,
          (first.y + second.y) / 2,
        );
        return;
      }

      // Con un solo dedo se desplaza sólo por los ejes que se salen de la
      // pantalla; el clamp de `apply` deja quieto al que entra entero.
      const { x: overflowX, y: overflowY } = overflow();
      if (pointers.current.size === 1 && (overflowX || overflowY)) {
        event.preventDefault();
        const current = transformRef.current;
        apply({ ...current, x: current.x + deltaX, y: current.y + deltaY });
      }
    };

    const finishPointer = (event: PointerEvent): void => {
      const tracked = pointers.current.get(event.pointerId);
      pointers.current.delete(event.pointerId);
      if (pointers.current.size < 2) pinchStart.current = null;
      if (!tracked) return;

      const elapsed = Date.now() - tracked.startedAt;
      const movedX = tracked.x - tracked.startX;
      const movedY = tracked.y - tracked.startY;
      const moved = Math.hypot(movedX, movedY);

      if (moved <= TAP_MAX_MOVE_PX && elapsed <= TAP_MAX_MS) {
        const now = Date.now();
        const previous = lastTap.current;
        const zoomable = allowDoubleTapAt?.(tracked.x, element.clientWidth) ?? true;
        const isDoubleTap =
          zoomable &&
          previous !== null &&
          now - previous.at <= DOUBLE_TAP_MAX_MS &&
          Math.hypot(tracked.x - previous.x, tracked.y - previous.y) <= DOUBLE_TAP_MAX_DISTANCE_PX;

        if (isDoubleTap) {
          lastTap.current = null;
          if (transformRef.current.scale > 1) reset();
          else scaleAround(DOUBLE_TAP_SCALE, tracked.x, tracked.y);
          return;
        }

        lastTap.current = zoomable ? { at: now, x: tracked.x, y: tracked.y } : null;
        onTap?.(tracked.x, tracked.y, element.clientWidth);
        return;
      }

      // El swipe cambia de página sólo si no hay nada que correr en horizontal:
      // con zoom, el arrastre horizontal es desplazamiento.
      if (
        !overflow().x &&
        Math.abs(movedX) >= SWIPE_MIN_PX &&
        Math.abs(movedX) > Math.abs(movedY) &&
        elapsed <= SWIPE_MAX_MS
      ) {
        onSwipe?.(movedX < 0 ? 'left' : 'right');
      }
    };

    const handleWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      scaleAround(
        transformRef.current.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };

    element.addEventListener('pointerdown', handleDown);
    element.addEventListener('pointermove', handleMove, { passive: false });
    element.addEventListener('pointerup', finishPointer);
    element.addEventListener('pointercancel', finishPointer);
    element.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      element.removeEventListener('pointerdown', handleDown);
      element.removeEventListener('pointermove', handleMove);
      element.removeEventListener('pointerup', finishPointer);
      element.removeEventListener('pointercancel', finishPointer);
      element.removeEventListener('wheel', handleWheel);
      pointers.current.clear();
      pinchStart.current = null;
    };
  }, [enabled, apply, scaleAround, reset, overflow, onTap, onSwipe, allowDoubleTapAt]);

  return {
    ref,
    contentRef,
    transform,
    css: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
    reset,
    zoomBy,
  };
}
