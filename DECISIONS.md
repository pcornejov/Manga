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

## Fase 3 — Búsqueda y ficha

- **Portadas con `IntersectionObserver` en vez de `loading="lazy"`**: hay que decidir *cuándo* se pide cada imagen para poder encolarla, y el atributo nativo no da ese control.
- **Cola propia de 5 req/s para las portadas**: medido contra el servidor, `uploads.mangadex.org` responde 403 cuando una grilla le pide 20 imágenes de golpe, y el mismo pedido funciona segundos después; el techo tolerado es el mismo 5 req/s de la API. Va en una cola aparte de la del lector porque ahí el límite es de concurrencia y no de ritmo.
- **Reintento con espera creciente en las portadas**: el 403 es transitorio, así que rendirse al primer fallo deja huecos en una grilla que en realidad sí carga.
- **Virtualización propia (`useVirtualList`) y no una dependencia**: hace falta una sola lista con dos alturas fijas conocidas de antemano, que se resuelve con offsets acumulados y búsqueda binaria.
- **La lista se aplana a filas antes de virtualizar**: mezclar encabezados de volumen y capítulos en un solo array permite una única ventana virtual en lugar de una por grupo.
- **Búsqueda con `AbortController`**: el debounce recorta casi todo, pero con la API lenta pueden quedar dos búsquedas en vuelo y ganar la vieja.
- **La ficha filtra por `isReadable`**: la edición a color de Bleach tiene 979 capítulos y muchas obras publican capítulos que viven en otro sitio; listarlos lleva a una pantalla vacía.

## Fase 4 — El lector

- **Un semáforo global de 3 en `imageLoader`, no un contador por componente**: es lo que separa "precargar las dos siguientes" de "pedir el capítulo entero", y tiene que valer para los tres modos a la vez.
- **Las páginas se pintan recién cuando `loadImage` resuelve**: así todo el tráfico pasa por el semáforo; el `<img>` posterior es un acierto de caché porque MangaDex@Home manda `immutable`.
- **El modo continuo monta sólo una ventana de páginas y no las desmonta**: montarlas todas dispararía las descargas de golpe, y desmontarlas cambiaría el alto del documento debajo del scroll.
- **En el modo continuo el scroll lo maneja el navegador**: los gestos propios existen para que el pinch nativo no se pelee con el cambio de página, conflicto que en vertical no existe.
- **El arrastre de un dedo se habilita por eje según lo que se salga de pantalla**: con ajuste a lo ancho una página es más alta que el viewport y su parte de abajo quedaría inaccesible, pero el swipe horizontal tiene que seguir cambiando de página.
- **El desplazamiento se acota a ±(contenido−contenedor)/2**: sin tope se puede arrastrar la página fuera de la pantalla y quedarse mirando el fondo.
- **`reset()` deja la página arriba, no centrada**: una página más alta que la pantalla se empieza a leer por el principio.
- **El doble tap sólo hace zoom en la franja central**: en los costados un tap es siempre cambio de página, y pasar dos páginas seguidas no debe terminar agrandando la imagen.
- **Dos taps lejos uno del otro no son un doble tap**: sin el chequeo de distancia, tocar izquierda y derecha rápido se interpretaba como zoom.
- **Los vecinos del capítulo se buscan dentro del mismo idioma**: encadenar a otra traducción a mitad de la obra no tiene sentido.
- **El panel de fin de capítulo espera al feed**: mostrar "último capítulo disponible" antes de saber si hay siguiente es directamente mentira.

## Fase 5 — Persistencia y progreso

- **`progress` tiene una fila por capítulo, no una por obra**: la misma tabla resuelve reanudar en la página exacta y saber qué capítulos ya se leyeron.
- **El progreso guarda el título y la portada de la obra**: "Continuar leyendo" se pinta sin tocar la red ni depender de que la obra esté en la biblioteca.
- **Espejo del progreso en `localStorage`**: medido en el navegador, una escritura de IndexedDB arrancada al ocultarse la pestaña se descarta, mientras que `localStorage` es síncrono y siempre llega; lo pendiente se vuelca a IndexedDB al abrir la base.
- **La reconciliación cuelga de `getDb()`**: al hacerla parte de la promesa de apertura, cualquier lectura posterior ya ve el dato recuperado, sin carreras ni cableado en el arranque.
- **`saveProgressNow` usa la base ya abierta**: una escritura que empieza después de un `await` no llega a confirmarse cuando el documento se está destruyendo.
- **El store de preferencias escribe sin esperar**: la preferencia ya se aplicó en memoria y trabar la UI por un write a IndexedDB no aporta nada.
- **`downloads` se crea en la versión 1 del esquema**: migrar IndexedDB por una store que ya se sabe que va a hacer falta en la fase 6 es trabajo al pedo.
