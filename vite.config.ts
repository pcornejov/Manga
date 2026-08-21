import type { IncomingMessage, ServerResponse } from 'node:http';
import { type Plugin, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const USER_AGENT = 'manga-reader-pwa/0.1 (+https://github.com/pcornejov/Manga)';
const API_ORIGIN = 'https://api.mangadex.org';
const ALLOWED_IMAGE_HOSTS = ['uploads.mangadex.org'];
const ALLOWED_IMAGE_SUFFIX = '.mangadex.network';

/**
 * Réplica en desarrollo de las Pages Functions de `functions/`.
 *
 * Sin esto, `npm run dev` tendría que pegarle directo a MangaDex y se comportaría
 * distinto que el sitio desplegado. Es el mismo contrato: `/api/*` y `/img?url=`.
 */
function mangadexProxy(): Plugin {
  const forward = async (target: string, res: ServerResponse): Promise<void> => {
    const upstream = await fetch(target, {
      headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    });
    res.statusCode = upstream.status;
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('content-type', contentType);
    // Reenviar `cache-control` no es cosmético: sin él el navegador vuelve a
    // pedir cada imagen al pintarla y se duplica el tráfico.
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('cache-control', cacheControl);
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) res.setHeader('retry-after', retryAfter);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  };

  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ): Promise<void> => {
    const path = req.url ?? '';
    try {
      if (path.startsWith('/api/')) {
        await forward(`${API_ORIGIN}${path.slice('/api'.length)}`, res);
        return;
      }
      if (path.startsWith('/img?')) {
        const raw = new URL(path, 'http://localhost').searchParams.get('url');
        const target = raw ? new URL(raw) : null;
        const allowed =
          target !== null &&
          target.protocol === 'https:' &&
          (ALLOWED_IMAGE_HOSTS.includes(target.hostname) ||
            target.hostname.endsWith(ALLOWED_IMAGE_SUFFIX));
        if (!allowed) {
          res.statusCode = 400;
          res.end('Host no permitido');
          return;
        }
        await forward(target.toString(), res);
        return;
      }
    } catch (error) {
      res.statusCode = 502;
      res.end(String(error));
      return;
    }
    next();
  };

  return {
    name: 'mangadex-proxy',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    // `preview` también lo necesita: es la única forma de probar el build local
    // sin desplegar, porque las Pages Functions sólo existen en Cloudflare.
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    mangadexProxy(),
    VitePWA({
      registerType: 'autoUpdate',
      // El SW también corre en `npm run dev`, si no el modo offline sólo se
      // podría probar sobre el build.
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['icon-64.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Manga Reader',
        short_name: 'Manga',
        description: 'Lector de manga sobre la API pública de MangaDex.',
        lang: 'es',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0b0b0f',
        theme_color: '#0b0b0f',
        icons: [
          { src: '/icon-64.png', sizes: '64x64', type: 'image/png' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // El proxy no es navegación: sin esto una llamada fallida devolvería el HTML.
        navigateFallbackDenylist: [/^\/api\//, /^\/img/],
        runtimeCaching: [
          {
            // La API cambia seguido: primero la red, y la caché sólo cubre el
            // rato en que no hay conexión.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mangadex-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Portadas y páginas de capítulo, ambas por `/img`. Es la misma caché
            // donde escribe el botón de descarga, y no caduca por antigüedad: un
            // capítulo descargado no puede desaparecer solo. El tope de entradas
            // acota lo que se acumula por lectura casual.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname === '/img',
            handler: 'CacheFirst',
            options: {
              cacheName: 'mangadex-pages',
              expiration: { maxEntries: 3_000 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
