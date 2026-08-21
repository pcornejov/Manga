import { type PagesFunction, badRequest, isAllowedImageHost, proxyToMangaDex } from './_shared';

/** Las imágenes de MangaDex son inmutables: se pueden cachear con ganas. */
const CACHE_SECONDS = 60 * 60 * 24 * 30;

/**
 * Proxy de imágenes: `/img?url=<url de MangaDex>`.
 *
 * El host va en la query porque el nodo de MangaDex@Home que sirve un capítulo
 * cambia con cada pedido de `/at-home/server/`. La lista blanca es lo que impide
 * que esto termine siendo un proxy abierto a cualquier destino.
 */
export const onRequestGet: PagesFunction = async ({ request }) => {
  const raw = new URL(request.url).searchParams.get('url');
  if (!raw) return badRequest('Falta el parámetro url.');

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return badRequest('El parámetro url no es una URL válida.');
  }

  if (target.protocol !== 'https:' || !isAllowedImageHost(target.hostname)) {
    return badRequest('Ese host no está permitido.');
  }

  return proxyToMangaDex(target, CACHE_SECONDS);
};
