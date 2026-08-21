/**
 * Carga de imágenes del lector con tope de concurrencia.
 *
 * El lector nunca puede tener más de `MAX_IN_FLIGHT` imágenes bajando a la vez:
 * es lo que separa "precargar las dos siguientes" de "pedir el capítulo entero".
 * Todo el que quiera una página pasa por acá, así el tope es global y no por
 * componente.
 */

import { RequestQueue } from './rateLimiter';

const MAX_IN_FLIGHT = 3;

/**
 * `uploads.mangadex.org` aplica el mismo techo de 5 req/s que la API y responde
 * 403 al pasarlo. Las portadas van por su propia cola para no comerse los lugares
 * del lector, que se rige por concurrencia y no por ritmo.
 */
const coverQueue = new RequestQueue(5, 1_000, 'covers');

let inFlight = 0;
const waiting: Array<() => void> = [];
/** Requests ya resueltos: repetir uno no gasta un lugar de la cola. */
const loaded = new Set<string>();
const pending = new Map<string, Promise<void>>();

function acquire(): Promise<void> {
  if (inFlight < MAX_IN_FLIGHT) {
    inFlight += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiting.push(() => {
      inFlight += 1;
      resolve();
    });
  });
}

function release(): void {
  inFlight -= 1;
  waiting.shift()?.();
}

/** Cantidad de imágenes bajando ahora mismo. Se usa para verificar el tope. */
export function inFlightCount(): number {
  return inFlight;
}

export function isLoaded(url: string): boolean {
  return loaded.has(url);
}

function fetchImage(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      loaded.add(url);
      resolve();
    };
    image.onerror = () => {
      reject(new Error(`No se pudo cargar ${url}`));
    };
    image.src = url;
  });
}

/** Evita que dos componentes pidan la misma URL dos veces a la vez. */
function once(url: string, run: () => Promise<void>): Promise<void> {
  if (loaded.has(url)) return Promise.resolve();
  const existing = pending.get(url);
  if (existing) return existing;

  const task = run().finally(() => {
    pending.delete(url);
  });
  pending.set(url, task);
  return task;
}

/**
 * Baja una página del lector respetando el tope de concurrencia. Resuelve cuando
 * está en la caché del navegador, con lo cual pintarla después es instantáneo.
 */
export function loadImage(url: string): Promise<void> {
  return once(url, async () => {
    await acquire();
    try {
      await fetchImage(url);
    } finally {
      release();
    }
  });
}

/** Baja una portada al ritmo que tolera `uploads.mangadex.org`. */
export function loadCover(url: string): Promise<void> {
  return once(url, () => coverQueue.run(() => fetchImage(url)));
}

/** Precarga sin que importe el resultado: los errores los maneja quien la pinte. */
export function preloadImage(url: string): void {
  void loadImage(url).catch(() => undefined);
}

/** Olvida una URL fallida para que el próximo intento vuelva a pedirla. */
export function forgetImage(url: string): void {
  loaded.delete(url);
  pending.delete(url);
}
