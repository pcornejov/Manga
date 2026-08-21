import { type PagesFunction, joinPath, proxyToMangaDex } from '../_shared';

const API_ORIGIN = 'https://api.mangadex.org';
/** La API cambia seguido: caché corta, sólo para absorber ráfagas. */
const CACHE_SECONDS = 30;

/** Proxy de `/api/*` hacia `https://api.mangadex.org/*`, conservando la query. */
export const onRequestGet: PagesFunction = async ({ request, params }) => {
  const incoming = new URL(request.url);
  const target = new URL(`${API_ORIGIN}/${joinPath(params.path)}`);
  target.search = incoming.search;
  return proxyToMangaDex(target, CACHE_SECONDS);
};
