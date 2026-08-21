# PROGRESS

## Fase actual: 2 — Capa de datos + rate limiter ✅

### Hecho

**Fase 1 — Andamiaje**
- Proyecto Vite + React 18 + TypeScript (`strict: true`) + Tailwind 3.
- Router con `react-router-dom`: `/`, `/manga/:id`, `/read/:chapterId` (placeholders).
- Estructura de carpetas: `src/api`, `src/components`, `src/hooks`, `src/pages`, `src/store`, `src/db`.
- Gate: `npm run build` sin errores; las tres rutas renderizan sin errores de consola.

**Fase 2 — Capa de datos + rate limiter**
- `src/api/types.ts`: tipos de todas las respuestas usadas, sin `any`.
- `src/api/rateLimiter.ts`: cola con ventana deslizante (cuenta arranques, no duraciones).
- `src/api/client.ts`: cola global 5 req/s, cola separada 40/min para `/at-home/server/`,
  caché del `baseUrl` con TTL de 15 min + deduplicación de requests en vuelo,
  backoff exponencial ante 429/5xx respetando `Retry-After` y pausando la cola entera.
- `src/api/mangadex.ts`: búsqueda, detalle, feed paginado de a 500 y resolución de URLs de página.
- Gate: `npm run smoke:api` imprime URLs válidas, sin 429, y verifica que 15 requests
  simultáneas tarden ≥2 s.

### Falta
- Fase 3 — Búsqueda y ficha.
- Fase 4 — Lector.
- Fase 5 — Persistencia y progreso.
- Fase 6 — PWA y offline.

## Cómo correr

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b && vite build
npm run typecheck  # sólo TypeScript
```
