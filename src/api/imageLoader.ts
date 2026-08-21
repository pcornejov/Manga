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
 * `uploads.mangadex.org` acepta 5 req/s pero sólo si llegan parejas: medido
 * contra el servidor, una ráfaga de 5 seguida de una pausa de un segundo devuelve
 * 403 más de la mitad de las veces, mientras que una cada 200 ms no falla nunca.
 * De ahí la separación mínima. Va en su propia cola para no comerse los lugares
 * del lector, que se rige por concurrencia y no por ritmo.
 */
const coverQueue = new RequestQueue(5, 1_000, 'covers', 200);

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

/**
 * Error de carga que distingue un rechazo del servidor de un fallo pasajero.
 *
 * MangaDex responde 403 cuando la IP quedó bloqueada temporalmente por insistir
 * después de un 429, y su documentación avisa que seguir pegando escala a un
 * bloqueo definitivo. Ante un 403 hay que parar, no reintentar.
 */
export class ImageLoadError extends Error {
  constructor(
    readonly url: string,
    readonly rejected: boolean,
  ) {
    super(`No se pudo cargar ${url}`);
    this.name = 'ImageLoadError';
  }
}

/** Carga por `<img>`: no informa el código de estado, pero no lo necesita. */
function fetchImageElement(url: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      loaded.add(url);
      resolve();
    };
    image.onerror = () => {
      reject(new ImageLoadError(url, false));
    };
    image.src = url;
  });
}

/**
 * Carga por `fetch`, que sí informa el código de estado.
 *
 * Con `<img>` habría que repreguntar para saber si fue un 403, y ese pedido
 * extra llega justo cuando el servidor nos está frenando. Al terminar, la imagen
 * queda en la caché del navegador, así que pintarla después no cuesta red.
 */
async function fetchImageRequest(url: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ImageLoadError(url, false);
  }
  if (!response.ok) {
    throw new ImageLoadError(url, response.status === 403 || response.status === 429);
  }
  // Hay que consumir el cuerpo para que la respuesta entre en la caché.
  await response.blob();
  loaded.add(url);
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
      await fetchImageElement(url);
    } finally {
      release();
    }
  });
}

/** Baja una portada al ritmo que tolera `uploads.mangadex.org`. */
export function loadCover(url: string): Promise<void> {
  return once(url, () => coverQueue.run(() => fetchImageRequest(url)));
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
