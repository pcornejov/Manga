# PROGRESS

## Fase actual: 6 — PWA y offline ✅ (todas las fases completas)

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
- `CoverImage`: carga diferida real con `IntersectionObserver` + cola de 5 req/s y reintentos.
- Ficha: portada, título, sinopsis, autor, tags, estado, año.
- `ChapterList`: agrupada por volumen, virtualizada arriba de 200 filas
  (`src/hooks/useVirtualList.ts`), con los capítulos leídos y en curso marcados.
- Gate: Bleach (979 capítulos) renderiza 15 filas en el DOM y el scroll recorre la lista
  entera; sin errores de la app en consola y sin 429.

**Fase 4 — El lector**
- Tres modos conmutables y persistidos por obra: paginado RTL (default), LTR y continuo vertical.
- Navegación por teclado, clic en mitades (invertido en RTL) y swipe táctil.
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
- "Continuar leyendo" y "Siguiendo" en la pantalla de inicio.
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

### Pendiente / conocido
- `uploads.mangadex.org` limita las portadas a ~5 req/s por IP y responde 403 al pasarse.
  La app pide las portadas de a poco (`IntersectionObserver` + cola de 5 req/s) y reintenta
  con espera creciente; bajo un límite ya saturado igual pueden quedar huecos.

## Cómo correr

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build
npm run typecheck  # sólo TypeScript
npm run smoke:api  # smoke test de la capa de datos contra la API real
npm run preview    # sirve dist/ (necesario para probar el Service Worker del build)
```

## Probar el modo offline

1. `npm run build && npm run preview`
2. Abrir la ficha de una obra y tocar **Descargar** en un capítulo.
3. En DevTools → Network, marcar **Offline**.
4. Recargar y abrir el capítulo: se lee completo sin red.
