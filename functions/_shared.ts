/**
 * Lógica común de las Pages Functions que hacen de proxy hacia MangaDex.
 *
 * MangaDex exige que las peticiones de los usuarios pasen por un servidor propio:
 * no manda cabeceras CORS a otros sitios y devuelve respuestas incorrectas a las
 * imágenes enlazadas desde afuera. Además pide un `User-Agent` identificable, que
 * el navegador no deja poner, y prohíbe la cabecera `Via`.
 * Ver https://api.mangadex.org/docs/2-limitations/
 */

/** Identificación de la app, como pide MangaDex. */
export const USER_AGENT = 'manga-reader-pwa/0.1 (+https://github.com/pcornejov/Manga)';

/** Hosts a los que este proxy tiene permitido salir. */
const ALLOWED_IMAGE_HOSTS = ['uploads.mangadex.org'];
const ALLOWED_IMAGE_SUFFIX = '.mangadex.network';

/** Tipos mínimos de Pages Functions, para no depender de `@cloudflare/workers-types`. */
export interface FunctionContext {
  request: Request;
  params: Record<string, string | string[]>;
}

export type PagesFunction = (context: FunctionContext) => Promise<Response>;

export function isAllowedImageHost(hostname: string): boolean {
  return ALLOWED_IMAGE_HOSTS.includes(hostname) || hostname.endsWith(ALLOWED_IMAGE_SUFFIX);
}

/** Junta los segmentos de una ruta comodín (`[[path]]`). */
export function joinPath(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join('/');
  return value ?? '';
}

/**
 * Reenvía la petición a MangaDex con cabeceras limpias.
 *
 * No se pasan las del navegador: traen `Origin`, `Referer` y cookies que no
 * corresponden, y podrían arrastrar un `Via` que MangaDex rechaza.
 */
export async function proxyToMangaDex(target: URL, cacheSeconds: number): Promise<Response> {
  const upstream = await fetch(target.toString(), {
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
      Accept: '*/*',
    },
    // La caché de Cloudflare absorbe los pedidos repetidos y baja la presión
    // sobre el límite de 5 req/s, que se cuenta por IP de salida.
    cf: { cacheEverything: true, cacheTtl: cacheSeconds },
  } as RequestInit);

  const headers = new Headers();
  const contentType = upstream.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const cacheControl = upstream.headers.get('cache-control');
  headers.set('cache-control', cacheControl ?? `public, max-age=${cacheSeconds}`);
  // `Retry-After` lo necesita el backoff del cliente ante un 429.
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) headers.set('retry-after', retryAfter);

  return new Response(upstream.body, { status: upstream.status, headers });
}

export function badRequest(message: string): Response {
  return new Response(JSON.stringify({ result: 'error', errors: [{ title: message }] }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
}
