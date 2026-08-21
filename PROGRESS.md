# PROGRESS

## Estado: desplegado y funcionando ✅

**https://manga-reader-e9q.pages.dev**

### Hecho

**Fase 1 — Andamiaje**
- Vite + React 18 + TypeScript (`strict: true`) + Tailwind 3.
- Rutas `/`, `/manga/:id`, `/read/:chapterId`.
- Carpetas: `src/api`, `src/components`, `src/hooks`, `src/pages`, `src/store`, `src/db`.

**Fase 2 — Capa de datos + rate limiter**
- `src/api/types.ts`: tipos de todas las respuestas usadas, sin `any`.
- `src/api/rateLimiter.ts`: cola con ventana deslizante (cuenta arranques, no duraciones).
- `src/api/client.ts`: cola global 5 req/s, cola separada 40/min para `/at-home/server/`,
  caché del `baseUrl` con TTL de 15 min + deduplicación de pedidos en vuelo, backoff
  exponencial ante 429/5xx respetando `Retry-After` y pausando la cola entera.
- `src/api/mangadex.ts`: búsqueda, detalle, feed paginado de a 500, URLs de página.
- Gate: `npm run smoke:api` imprime URLs válidas, sin 429, y comprueba que 15 requests
  simultáneas tarden ≥2 s.

**Fase 3 — Búsqueda y ficha**
- Búsqueda con debounce de 400 ms, cancelación de la request anterior y grilla de portadas.
- `CoverImage`: carga diferida real con `IntersectionObserver` + cola espaciada a 200 ms
  y reintentos con espera creciente.
- Ficha: portada, título, sinopsis, autor, tags, estado, año.
- Las obras licenciadas (Death Note, Attack on Titan) no aparecen en los resultados: la
  búsqueda descarta las que no tienen ningún capítulo que la app pueda abrir. Si se entra
  a su ficha directamente, se explica el motivo con enlace al lector oficial.
- La lista muestra un solo idioma (español preferido, inglés como último recurso) con
  selector si hay más, y una sola versión por número de capítulo.
- `ChapterList`: agrupada por volumen, virtualizada arriba de 200 filas
  (`src/hooks/useVirtualList.ts`), con los capítulos leídos y en curso marcados.
- Gate: Bleach (979 capítulos) renderiza 15 filas en el DOM y el scroll recorre la lista
  entera; sin errores de la app en consola y sin 429.

**Fase 4 — El lector**
- Tres modos conmutables y persistidos por obra: **continuo vertical (default)**, paginado
  RTL y paginado LTR. El default es el continuo porque el uso real es como PWA en el
  teléfono; se cambia desde la barra inferior y la elección queda guardada por obra.
- Navegación por teclado, clic en mitades (invertido en RTL) y swipe táctil. En el modo
  continuo el teclado scrollea (flechas, espacio, AvPág/RePág, Inicio/Fin).
- Precarga de las 2 páginas siguientes; nunca el capítulo entero.
- Zoom/pan propio con Pointer Events sobre `touch-action: none`: pinch, arrastre acotado,
  doble tap (sólo en la franja central) y ctrl+rueda.
- Ajuste de imagen ancho / alto / original.
- Botón al capítulo siguiente del feed al llegar al final, sin volver a la ficha.
- Barras con auto-hide, que vuelven al mover el mouse o tocar el centro.
- Fallback a `dataSaver` cuando la calidad original falla dos veces.
- Gate: capítulo completo leído en los tres modos; máximo de **3** imágenes en vuelo,
  medido en el semáforo de la app (1351 muestras) y en el tráfico de red.

**Fase 5 — Persistencia y progreso**
- IndexedDB (`idb`) con `library`, `progress`, `settings` (y `downloads`, que usa la fase 6).
- Progreso guardado con throttle de 1 s, volcado inmediato al ocultarse la pestaña y
  espejo en `localStorage` que se reconcilia al abrir la base.
- "Continuar leyendo" y "Siguiendo" en la pantalla de inicio, más descubrimiento:
  **Novedades** (obras con capítulos recién subidos en los idiomas configurados),
  **Mejor valoradas**, **Populares** y navegación por **género**, todo filtrado a lo que la
  app puede abrir. Cada portada lleva su puntuación, y la ficha muestra nota y seguidores.
- Botón de seguir / dejar de seguir en la ficha.
- Gate: leer 7 páginas, cerrar la pestaña, reabrir y reanudar en la página exacta.

**Fase 6 — PWA y offline**
- Manifest e iconos (64/192/512 + maskable), generados sin dependencias con un script propio.
- Service Worker con `vite-plugin-pwa` (`generateSW`), activo también en `npm run dev`.
- Estrategias: `NetworkFirst` para `api.mangadex.org` (caché de 1 día, timeout de red de 8 s),
  `CacheFirst` para portadas (30 días) y `CacheFirst` sin caducidad para las páginas
  de capítulo, que es donde escribe la descarga explícita.
- Botón "Descargar" por capítulo en la ficha, con barra de progreso y borrado.
- Pantalla `/almacenamiento`: capítulos descargados, cuánto ocupan, uso total del sitio
  según `navigator.storage.estimate()` y borrado individual.
- Un capítulo descargado es autosuficiente: guarda sus URLs, la etiqueta y el título de la
  obra, así que abre sin red sin depender de la API.
- Gate: descargar un capítulo, cortar la red, recargar y leerlo completo (11/11 páginas
  pintadas de verdad); la home también abre sin conexión.

**Proxy propio (`functions/`)**
- La premisa de que la API acepta CORS desde el navegador **sólo vale para `localhost`**.
  MangaDex exige por documentación que las peticiones pasen por un servidor propio, tanto
  para el JSON como para las imágenes. Ver `DECISIONS.md`.
- `functions/api/[[path]].ts` → proxy de `/api/*` hacia `https://api.mangadex.org/*`.
- `functions/img.ts` → proxy de `/img?url=…` con lista blanca
  (`uploads.mangadex.org` y `*.mangadex.network`, sólo `https`).
- Ambas ponen el `User-Agent` que MangaDex pide y que el navegador no deja poner.
- `vite.config.ts` replica las dos rutas en el dev server y en `preview`, así el desarrollo
  se comporta igual que el sitio desplegado.
- Verificado ejecutando las Functions reales con Requests reales: proxy de búsqueda, feed
  con parámetros `[]`, `/at-home/server/`, imágenes de los dos hosts, y rechazo (400) de
  host ajeno, `http`, subdominio falso y parámetro faltante.

### Notas
- `uploads.mangadex.org` limita las portadas por IP **y no tolera ráfagas**: la app las pide
  de a una cada 200 ms (`IntersectionObserver` + cola con separación mínima). Los 403 que
  aparecen de a ratos en desarrollo son el presupuesto por IP de la máquina, que MangaDex
  cuenta por IP y comparte entre todos los usuarios de una red compartida; por el proxy, con
  el `User-Agent` correcto, las mismas portadas que fallaban dan 200.
- En `npm run dev` el Service Worker no aplica las reglas de `runtimeCaching`, así que cada
  imagen se pide dos veces (una al bajarla y otra al pintarla). En el build no pasa:
  medido contra el servidor, 3 portadas en pantalla = 3 salidas a MangaDex, sin repetidos.

## Interfaz

- Navegación inferior con tres pestañas: **Inicio** (buscar y descubrir), **Biblioteca**
  (continuar leyendo y obras seguidas) y **Descargas**. En el lector se oculta.
- Pensada para teléfono: respeta el notch y la barra de gestos, secciones en carrusel,
  tarjetas alineadas, sinopsis y etiquetas recortadas, y esqueletos de carga en vez de
  ruedas girando.

## Cómo correr

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build
npm run typecheck  # sólo TypeScript
npm test           # 17 tests unitarios (runner de Node)
npm run test:e2e   # 11 tests de navegador (Playwright, con datos fijos)
npm run check      # typecheck + tests + build + E2E
npm run smoke:api  # smoke test de la capa de datos contra la API real
npm run preview    # sirve dist/ (necesario para probar el Service Worker del build)
```

## Despliegue

Publicado en Cloudflare Pages: **https://manga-reader-e9q.pages.dev**
(el subdominio lleva sufijo porque `manga-reader.pages.dev` ya estaba tomado).

- **Proyecto**: `manga-reader` · **rama de producción**: `claude/manga-reader-pwa-9zevgi`
- **No hace falta `_redirects`**: Pages hace el fallback de SPA solo, porque el build no
  incluye un `404.html` en la raíz. Verificado en producción: `/manga/:id`, `/read/:id` y
  `/almacenamiento` devuelven 200.
- No hay variables de entorno ni secretos en el proyecto.

### Volver a desplegar

```bash
npm run build
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… \
  npx wrangler pages deploy dist --project-name=manga-reader \
  --branch=claude/manga-reader-pwa-9zevgi
```

`wrangler` compila `functions/` al Worker como parte del deploy. El token necesita
únicamente el permiso `Account → Cloudflare Pages → Edit`.

Alternativa sin token: conectar el repo desde el dashboard (Workers & Pages → el proyecto →
Settings → Builds → Connect to Git), con build `npm run build` y output `dist`. Queda con
despliegue automático en cada push.

### Verificado en producción

- App, `sw.js` y manifest sirven 200; el Service Worker registra con scope `/` y precachea
  9 entradas.
- Proxy de API (`/api/*`) y de imágenes (`/img?url=`) responden 200 con portadas y páginas
  de capítulo reales.
- La lista blanca de `/img` rechaza con 400 host ajeno, `http`, subdominio falso
  (`mangadex.network.ejemplo.com`) y parámetro faltante.
- No inyecta CORS: no es utilizable como proxy desde otros sitios.
- Recorrido completo en navegador (búsqueda 9/9 portadas → ficha → lector 1520×2400,
  paso de página y cambio de modo) sin una sola respuesta distinta de 200 ni errores de
  consola.
- La app abre sin red, incluso en rutas profundas.

## Probar el modo offline

1. `npm run build && npm run preview`
2. Abrir la ficha de una obra y tocar **Descargar** en un capítulo.
3. En DevTools → Network, marcar **Offline**.
4. Recargar y abrir el capítulo: se lee completo sin red.
