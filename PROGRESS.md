# PROGRESS

## Fase actual: 1 — Andamiaje ✅

### Hecho
- Proyecto Vite + React 18 + TypeScript (`strict: true`) + Tailwind 3.
- Router con `react-router-dom`: `/`, `/manga/:id`, `/read/:chapterId` (placeholders).
- Estructura de carpetas: `src/api`, `src/components`, `src/hooks`, `src/pages`, `src/store`, `src/db`.
- Gate: `npm run build` sin errores; las tres rutas renderizan sin errores de consola.

### Falta
- Fase 2 — Capa de datos + rate limiter.
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
