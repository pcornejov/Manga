# DECISIONS

Cada decisión técnica no obvia, con el porqué en una línea.

## Fase 1 — Andamiaje

- **Tailwind 3.4 y no 4.x**: la v4 mueve la config a CSS y cambia el pipeline; la v3 con PostCSS es la ruta estable y no agrega el paquete extra `@tailwindcss/vite`.
- **`tsconfig` con project references** (`app` + `node`): el código de `src` compila con libs DOM y el de `scripts`/config con tipos de Node, sin mezclar globals ni relajar `strict`.
- **`noUncheckedIndexedAccess: true`**: el lector indexa arrays de páginas por número; que el acceso devuelva `T | undefined` evita el `pages[i].url` que revienta al final del capítulo.
- **Paleta `ink` propia en Tailwind**: el lector necesita un fondo neutro oscuro fijo que no compita con la página del manga; los grises de Tailwind tiran a azul.
- **Vulnerabilidades de `npm audit` sin resolver**: las 5 son de `esbuild` (sólo dev server) y `react-router` (open redirect en SSR / `deserializeErrors`), y arreglarlas exige saltar a Vite 8 y React Router 7, fuera del stack acordado; la app es client-side, sin SSR y sin rutas construidas con input del usuario.
