import { RequestQueue } from './rateLimiter';
import type { AtHomeResponse, ErrorResponse } from './types';

export const UPLOADS_ORIGIN = 'https://uploads.mangadex.org';
const API_ORIGIN = 'https://api.mangadex.org';

/**
 * Desde el navegador todo sale por el proxy propio; desde Node (el smoke test)
 * se va directo a MangaDex.
 *
 * MangaDex no manda cabeceras CORS a otros orígenes y exige un `User-Agent`
 * identificable que el navegador no deja poner, así que un cliente 100% browser
 * no puede cumplir su política. Ver https://api.mangadex.org/docs/2-limitations/
 */
const IN_BROWSER = typeof window !== 'undefined';

export const API_BASE = IN_BROWSER ? `${window.location.origin}/api` : API_ORIGIN;

/**
 * Envuelve una imagen de MangaDex en el proxy propio.
 *
 * Hace falta porque MangaDex "sirve la respuesta incorrecta" a cualquier imagen
 * enlazada desde otro dominio. En Node no hay proxy ni hace falta.
 */
export function imageUrl(upstream: string): string {
  if (!IN_BROWSER) return upstream;
  return `${window.location.origin}/img?url=${encodeURIComponent(upstream)}`;
}

/** Identificación pedida por MangaDex; en el navegador la pone el proxy. */
const USER_AGENT = 'manga-reader-pwa/0.1';

/** Límite global de la API. */
const globalQueue = new RequestQueue(5, 1_000, 'global');
/** Límite propio de /at-home/server/. */
const atHomeQueue = new RequestQueue(40, 60_000, 'at-home');

const MAX_RETRIES = 4;
const AT_HOME_TTL_MS = 15 * 60 * 1_000;

export class MangaDexError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'MangaDexError';
  }
}

/** Valores admitidos en la query: los arrays se serializan como `param[]=a&param[]=b`. */
export type QueryParams = Record<string, string | number | boolean | string[] | undefined>;

export function buildUrl(path: string, params: QueryParams = {}): string {
  // Concatenado y no `new URL(path, base)`: con una ruta absoluta esa forma se
  // come el prefijo `/api` del proxy.
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(`${key}[]`, item);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Segundos de `Retry-After`, o `null` si no vino o no es un número. */
function retryAfterMs(response: Response): number | null {
  const header = response.headers.get('Retry-After');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds * 1_000 : null;
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorResponse;
    const first = body.errors[0];
    return first ? `${first.title}: ${first.detail ?? ''}`.trim() : response.statusText;
  } catch {
    return response.statusText;
  }
}

/**
 * Ejecuta el fetch reintentando ante 429 y 5xx.
 *
 * El 429 además frena la cola completa durante el `Retry-After`, para no gastar
 * los reintentos de los requests que venían atrás contra el mismo límite.
 */
async function fetchWithBackoff(
  url: string,
  queue: RequestQueue,
  signal: AbortSignal | undefined,
): Promise<Response> {
  let lastError: MangaDexError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await queue.run(() =>
      fetch(url, {
        signal: signal ?? null,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      }),
    );

    if (response.ok) return response;

    // Backoff exponencial: 1s, 2s, 4s, 8s.
    const backoff = 1_000 * 2 ** attempt;

    if (response.status === 429) {
      const wait = retryAfterMs(response) ?? backoff;
      queue.pauseFor(wait);
      lastError = new MangaDexError(429, 'Rate limit alcanzado');
      if (attempt < MAX_RETRIES) {
        await sleep(wait);
        continue;
      }
    } else if (response.status >= 500) {
      lastError = new MangaDexError(response.status, await errorMessage(response));
      if (attempt < MAX_RETRIES) {
        await sleep(backoff);
        continue;
      }
    } else {
      throw new MangaDexError(response.status, await errorMessage(response));
    }
  }

  throw lastError ?? new MangaDexError(0, 'Falló el request sin respuesta');
}

export async function apiGet<T>(
  path: string,
  params: QueryParams = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetchWithBackoff(buildUrl(path, params), globalQueue, signal);
  return (await response.json()) as T;
}

// --- Caché de nodos MangaDex@Home ---

interface CachedAtHome {
  response: AtHomeResponse;
  expiresAt: number;
}

const atHomeCache = new Map<string, CachedAtHome>();
/** Requests en curso, para que dos páginas del mismo capítulo no pidan dos nodos. */
const atHomeInFlight = new Map<string, Promise<AtHomeResponse>>();

/**
 * Pide el nodo que sirve las imágenes del capítulo.
 *
 * Pasa por las dos colas (la de /at-home y la global) y cachea el resultado 15
 * minutos, que es lo que dura el `baseUrl` antes de vencer.
 */
export async function getAtHomeServer(
  chapterId: string,
  signal?: AbortSignal,
): Promise<AtHomeResponse> {
  const cached = atHomeCache.get(chapterId);
  if (cached && cached.expiresAt > Date.now()) return cached.response;

  const inFlight = atHomeInFlight.get(chapterId);
  if (inFlight) return inFlight;

  const request = (async (): Promise<AtHomeResponse> => {
    const response = await atHomeQueue.run(() =>
      fetchWithBackoff(buildUrl(`/at-home/server/${chapterId}`), globalQueue, signal),
    );
    const body = (await response.json()) as AtHomeResponse;
    atHomeCache.set(chapterId, { response: body, expiresAt: Date.now() + AT_HOME_TTL_MS });
    return body;
  })();

  atHomeInFlight.set(chapterId, request);
  try {
    return await request;
  } finally {
    atHomeInFlight.delete(chapterId);
  }
}

/** Descarta el nodo cacheado de un capítulo: se usa cuando una imagen da 403/404. */
export function invalidateAtHome(chapterId: string): void {
  atHomeCache.delete(chapterId);
}
