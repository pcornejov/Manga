import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
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
        runtimeCaching: [
          {
            // La API cambia seguido: primero la red, y la caché sólo cubre el
            // rato en que no hay conexión.
            urlPattern: ({ url }) => url.hostname === 'api.mangadex.org',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'mangadex-api',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Las portadas no cambian nunca para un mismo nombre de archivo.
            urlPattern: ({ url }) => url.hostname === 'uploads.mangadex.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'mangadex-covers',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Páginas de capítulo. La misma caché que llena el botón de
            // descarga, sin caducidad por antigüedad: un capítulo descargado no
            // puede desaparecer solo. El tope de entradas acota lo que se
            // acumula por lectura casual.
            urlPattern: ({ url }) => url.hostname.endsWith('.mangadex.network'),
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
