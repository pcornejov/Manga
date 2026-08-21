# DECISIONS

Cada decisión técnica no obvia, con el porqué en una línea.

## Fase 1 — Andamiaje

- **Tailwind 3.4 y no 4.x**: la v4 mueve la config a CSS y cambia el pipeline; la v3 con PostCSS es la ruta estable y no agrega el paquete extra `@tailwindcss/vite`.
- **`tsconfig` con project references** (`app` + `node`): el código de `src` compila con libs DOM y el de `scripts`/config con tipos de Node, sin mezclar globals ni relajar `strict`.
- **`noUncheckedIndexedAccess: true`**: el lector indexa arrays de páginas por número; que el acceso devuelva `T | undefined` evita el `pages[i].url` que revienta al final del capítulo.
- **Paleta `ink` propia en Tailwind**: el lector necesita un fondo neutro oscuro fijo que no compita con la página del manga; los grises de Tailwind tiran a azul.
- **Vulnerabilidades de `npm audit` sin resolver**: las 5 son de `esbuild` (sólo dev server) y `react-router` (open redirect en SSR / `deserializeErrors`), y arreglarlas exige saltar a Vite 8 y React Router 7, fuera del stack acordado; la app es client-side, sin SSR y sin rutas construidas con input del usuario.

## Fase 2 — Capa de datos + rate limiter

- **La cola limita arranques, no duraciones**: MangaDex cuenta requests por segundo, así que soltar el job sin `await` mantiene el throughput sin violar el límite; limitar concurrencia sería más lento sin ser más seguro.
- **Dos colas anidadas para `/at-home`**: ese endpoint tiene su propio techo (40/min) *además* del global (5/s), y anidarlas hace que respete los dos sin duplicar la lógica.
- **Un 429 pausa la cola completa, no sólo el request que lo recibió**: si uno chocó con el límite, los que venían atrás también van a chocar y quemarían sus reintentos al pedo.
- **Deduplicación de `/at-home` en vuelo** (`atHomeInFlight`): el lector precarga páginas del mismo capítulo en paralelo y, sin esto, cada una pediría su propio nodo contra un límite de 40/min.
- **El header `User-Agent` se manda igual aunque el navegador lo descarte**: es un *forbidden header name* del fetch spec, así que sólo tiene efecto real desde Node (el smoke test); mandarlo no cuesta nada y cumple con lo que pide MangaDex donde sí se puede.
- **Tope de `offset` en 10000 en el feed**: es el máximo que acepta la API; sin el corte, una obra enorme entraría en un loop de requests que devuelven error.
- **`isReadable()` filtra capítulos**: los que tienen `externalUrl` viven en otro sitio y los `isUnavailable` no tienen imágenes, así que mostrarlos sólo lleva al lector a una pantalla vacía.
- **El smoke test baja por la lista de resultados**: el primer match de "Frieren" es un doujin de una página sin traducción al español, así que se busca el primer resultado que sí tenga capítulos en español.
