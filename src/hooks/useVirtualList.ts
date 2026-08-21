import { type RefObject, useCallback, useEffect, useState } from 'react';

interface VirtualListOptions {
  /** Alto de cada fila, en px. Puede variar por índice. */
  itemHeight: (index: number) => number;
  itemCount: number;
  /** Filas extra arriba y abajo de la ventana visible. */
  overscan?: number;
}

interface VirtualListResult {
  /** Alto total del contenido, para que la scrollbar sea la real. */
  totalHeight: number;
  startIndex: number;
  endIndex: number;
  /** Desplazamiento del primer ítem renderizado. */
  offsetTop: number;
}

/**
 * Virtualización con alturas variables conocidas de antemano.
 *
 * Precalcula los offsets acumulados y busca el primer visible por búsqueda
 * binaria, así el costo por scroll no depende de la cantidad de ítems.
 */
export function useVirtualList(
  scrollRef: RefObject<HTMLElement>,
  { itemHeight, itemCount, overscan = 6 }: VirtualListOptions,
): VirtualListResult {
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  const measure = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    setScrollTop(element.scrollTop);
    setViewportHeight(element.clientHeight);
  }, [scrollRef]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    measure();

    element.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      element.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [scrollRef, measure]);

  // Offsets acumulados: `offsets[i]` es dónde empieza el ítem `i`.
  const offsets: number[] = [0];
  for (let i = 0; i < itemCount; i += 1) {
    offsets.push((offsets[i] ?? 0) + itemHeight(i));
  }
  const totalHeight = offsets[itemCount] ?? 0;

  const findIndexAt = (position: number): number => {
    let low = 0;
    let high = itemCount;
    while (low < high) {
      const mid = (low + high) >> 1;
      if ((offsets[mid + 1] ?? 0) <= position) low = mid + 1;
      else high = mid;
    }
    return Math.min(low, Math.max(0, itemCount - 1));
  };

  const firstVisible = findIndexAt(scrollTop);
  const lastVisible = findIndexAt(scrollTop + viewportHeight);

  const startIndex = Math.max(0, firstVisible - overscan);
  const endIndex = Math.min(itemCount, lastVisible + overscan + 1);

  return {
    totalHeight,
    startIndex,
    endIndex,
    offsetTop: offsets[startIndex] ?? 0,
  };
}
