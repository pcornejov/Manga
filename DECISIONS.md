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
- **El header `User-Agent` se manda desde el cliente y desde el proxy**: es un *forbidden header name* del fetch spec, así que en el navegador lo descarta; desde Node (el smoke test) y desde las Pages Functions sí viaja, que es donde MangaDex lo exige.
- **Tope de `offset` en 10000 en el feed**: es el máximo que acepta la API; sin el corte, una obra enorme entraría en un loop de requests que devuelven error.
- **`isReadable()` filtra capítulos**: los que tienen `externalUrl` viven en otro sitio y los `isUnavailable` no tienen imágenes, así que mostrarlos sólo lleva al lector a una pantalla vacía.
- **El smoke test baja por la lista de resultados**: el primer match de "Frieren" es un doujin de una página sin traducción al español, así que se busca el primer resultado que sí tenga capítulos en español.

## Fase 3 — Búsqueda y ficha

- **Portadas con `IntersectionObserver` en vez de `loading="lazy"`**: hay que decidir *cuándo* se pide cada imagen para poder encolarla, y el atributo nativo no da ese control.
- **Cola propia para las portadas, con separación mínima de 200 ms**: medido contra el servidor, `uploads.mangadex.org` tolera 5 req/s pero sólo si llegan parejos — una ráfaga de 5 y después un segundo de pausa (mismo promedio) devuelve 403 en más de la mitad de los casos, mientras que una cada 200 ms no falla ninguna. Por eso `RequestQueue` acepta un `minGapMs`: la API se banca las ráfagas y el host de imágenes no. Va en una cola aparte de la del lector porque ahí el límite es de concurrencia y no de ritmo.
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

## Fase 6 — PWA y offline

- **`generateSW` y no `injectManifest`**: un Service Worker propio necesitaría importar los paquetes `workbox-*` directamente, que son dependencias nuevas fuera del stack acordado; con las estrategias declarativas alcanza para lo pedido.
- **Iconos generados con un script de Python en vez de una librería**: son cuatro PNG planos de placeholder y escribir el chunk IHDR/IDAT a mano evita sumar una dependencia de imágenes.
- **El Service Worker también corre en `dev`** (`devOptions.enabled`): si no, el modo offline sólo se puede probar sobre el build y cualquier error de caché aparece recién al final.
- **La caché de páginas de capítulo no caduca por antigüedad**: un capítulo que el usuario descargó a propósito no puede desaparecer solo a los 30 días; el tope de 3000 entradas es lo que acota la acumulación por lectura casual.
- **La descarga escribe en la misma caché que usa el Service Worker**: así el capítulo descargado se sirve por la ruta normal de `CacheFirst`, sin lógica aparte para el modo offline.
- **Un capítulo descargado guarda sus URLs, su etiqueta y el título de la obra**: sin conexión no se puede pedir ni `/chapter/{id}` ni `/at-home/server/{id}`, y además pedir un nodo nuevo devolvería direcciones que no están en la caché porque el `baseUrl` cambia.
- **El lector tolera que fallen los metadatos y el feed si el capítulo está descargado**: sin red no hay título ni capítulo siguiente, pero eso no puede impedir leer lo que ya está guardado.
- **La descarga mide bytes con `response.clone().blob()`**: el host de imágenes manda CORS, así que la respuesta no es opaca y se puede medir de verdad en lugar de estimar.

## Fase 7 — Proxy propio para poder desplegar

Al preparar el despliegue apareció que la premisa original ("la API acepta CORS desde el
navegador") sólo vale para `localhost`. Medido contra el servidor, `api.mangadex.org`
manda `access-control-allow-origin` únicamente a orígenes `localhost` (cualquier esquema y
puerto, pero no `127.0.0.1`) y a `mangadex.org`; a cualquier otro origen no le manda nada,
con `vary: Origin`. Su
[documentación](https://api.mangadex.org/docs/2-limitations/) lo confirma y va más lejos:
proxear es obligatorio, para el JSON y también para las imágenes.

- **El proxy va como Pages Functions en el mismo repo, no como servicio aparte**: es el
  único componente de servidor que la política obliga a tener, y ponerlo junto al sitio
  evita sumar infraestructura, dominios y CORS entre piezas propias.
- **`/img?url=` con lista blanca en vez de una ruta por host**: el nodo de MangaDex@Home que
  sirve un capítulo cambia con cada `/at-home/server/`, así que el host no se puede fijar en
  la ruta. La lista blanca (`uploads.mangadex.org` y `*.mangadex.network`, sólo `https`) es
  lo que impide que esto quede como un proxy abierto a cualquier destino.
- **El proxy no reenvía las cabeceras del navegador**: traen `Origin`, `Referer` y cookies
  que no corresponden, y MangaDex rechaza explícitamente las peticiones con cabecera `Via`.
- **El proxy no inyecta CORS**: ahora todo es del mismo origen, así que no hace falta, y
  agregarlo convertiría el sitio en un proxy CORS abierto para cualquier otra página.
- **`cacheEverything` en la petición saliente**: la caché de Cloudflare absorbe los pedidos
  repetidos, que es lo que más alivia el límite de 5 req/s contado por IP de salida.
- **En el navegador la base es `/api`; desde Node se sigue yendo directo**: el smoke test
  no está sujeto a CORS y puede poner su propio `User-Agent`, así que sigue verificando el
  contrato real de MangaDex en lugar del de nuestro proxy.
- **El dev server y el `preview` replican las Functions con un middleware propio**: sin eso,
  `npm run dev` se comportaría distinto que el sitio desplegado y `npm run preview` no
  andaría, porque las Pages Functions sólo existen dentro de Cloudflare.
- **El middleware de dev reenvía `cache-control`**: sin él el navegador vuelve a pedir cada
  imagen al pintarla; se detectó porque el tope de imágenes en vuelo subió de 3 a 4.
- **Sin `_redirects`**: Cloudflare Pages ya hace el fallback de SPA solo cuando el proyecto
  no tiene un `404.html` en la raíz, y las Functions tienen precedencia sobre los assets.
  Un `/* /index.html 200` sería un riesgo innecesario de tapar las rutas del proxy.
- **Las portadas se bajan con `fetch` y no con `<img>`**: `fetch` informa el código de
  estado, y así un 403 se distingue de un fallo pasajero sin tener que repreguntar con un
  pedido extra, que es justo lo que no hay que hacer cuando el servidor te está frenando.
- **Ante un 403/429 no se reintenta**: MangaDex documenta que insistir después de un 429
  escala a un bloqueo temporal de IP (que se ve como 403) y después a uno permanente.

## Ajuste posterior — lectura vertical por default

- **El modo continuo pasa a ser el default**: el uso real es como PWA en el teléfono, donde
  scrollear hacia abajo es el gesto natural; el paginado RTL quedaba mejor en escritorio
  pero obligaba a arrastrar hacia el costado en cada página.
- **El teclado en modo continuo se maneja a mano**: el contenedor de scroll no recibe el
  foco, así que el navegador no scrolleaba con flechas ni con espacio; se detectó al
  probarlo justo después de cambiar el default. Las flechas mueven un cuarto de pantalla y
  espacio o AvPág casi una entera.
- **La preferencia por obra se mantiene**: si en una obra se elige otro modo a propósito,
  esa elección sigue mandando sobre el default.
