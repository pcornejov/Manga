/**
 * Smoke test de la capa de datos contra la API real de MangaDex.
 *
 *   npm run smoke:api
 *
 * Busca "Frieren", toma el primer resultado con capítulos en los idiomas
 * configurados, lista sus capítulos y resuelve las URLs del primero.
 * Verifica de paso que el rate limiter no deja pasar más de 5 req/s ni gatilla 429.
 */

import { MangaDexError } from '../src/api/client';
import {
  TRANSLATED_LANGUAGES,
  authorNames,
  chapterLabel,
  coverUrl,
  getChapterFeed,
  getChapterPageUrls,
  getManga,
  isReadable,
  mangaTitle,
  searchManga,
} from '../src/api/mangadex';
import type { Chapter, Manga } from '../src/api/types';

const QUERY = 'Frieren';
const SPANISH = ['es', 'es-la'];

const isSpanish = (chapter: Chapter): boolean =>
  SPANISH.includes(chapter.attributes.translatedLanguage);

function fail(message: string): never {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  console.log(`Buscando "${QUERY}"…`);
  const results = await searchManga(QUERY);
  if (results.length === 0) fail('La búsqueda no devolvió resultados.');
  console.log(`  ${results.length} resultados. Primero: ${mangaTitle(results[0] as Manga)}`);

  // El primer resultado suele ser un doujin de una página: se baja por la lista
  // hasta dar con uno que tenga capítulos en español, y si ninguno los tiene se
  // usa el primero que sea legible.
  let manga: Manga | null = null;
  let chapters: Chapter[] = [];
  let fallback: { manga: Manga; chapters: Chapter[] } | null = null;

  for (const candidate of results) {
    const feed = await getChapterFeed(candidate.id);
    const readable = feed.filter(isReadable);
    const spanish = readable.filter((chapter) => isSpanish(chapter));
    console.log(
      `  · ${mangaTitle(candidate)} → ${feed.length} capítulos, ${readable.length} legibles, ${spanish.length} en español`,
    );
    if (spanish.length > 0) {
      manga = candidate;
      chapters = spanish;
      break;
    }
    if (!fallback && readable.length > 0) fallback = { manga: candidate, chapters: readable };
  }

  if (!manga && fallback) {
    console.log('\n⚠️  Ningún resultado tiene capítulos en español; se usa el primero legible.');
    manga = fallback.manga;
    chapters = fallback.chapters;
  }

  if (!manga) {
    fail(`Ningún resultado tiene capítulos legibles en [${TRANSLATED_LANGUAGES.join(', ')}].`);
  }

  console.log(`\nObra elegida: ${mangaTitle(manga)}`);
  console.log(`  id       : ${manga.id}`);
  console.log(`  autor    : ${authorNames(manga).join(', ') || '(sin includes[]=author)'}`);
  console.log(`  portada  : ${coverUrl(manga) ?? '(sin cover_art)'}`);
  console.log(`  estado   : ${manga.attributes.status}`);

  const byLanguage = new Map<string, number>();
  for (const chapter of chapters) {
    const language = chapter.attributes.translatedLanguage;
    byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
  }
  console.log(`\nCapítulos legibles: ${chapters.length}`);
  for (const [language, count] of byLanguage) console.log(`  ${language}: ${count}`);

  console.log('\nPrimeros capítulos:');
  for (const chapter of chapters.slice(0, 5)) {
    console.log(
      `  [${chapter.attributes.translatedLanguage}] ${chapterLabel(chapter)} (${chapter.attributes.pages} págs)`,
    );
  }

  const first = chapters[0];
  if (!first) fail('No hay un primer capítulo que resolver.');

  console.log(`\nResolviendo páginas de ${chapterLabel(first)}…`);
  const pages = await getChapterPageUrls(first.id, 'data');
  const saver = await getChapterPageUrls(first.id, 'data-saver');

  if (pages.length === 0) fail('El capítulo no devolvió páginas.');
  console.log(`  ${pages.length} páginas (data) / ${saver.length} (data-saver)`);
  for (const url of pages.slice(0, 3)) console.log(`  ${url}`);

  // La segunda llamada tiene que salir de la caché de 15 min, sin pegarle a /at-home.
  const started = Date.now();
  await getChapterPageUrls(first.id, 'data');
  console.log(`  segunda resolución desde caché en ${Date.now() - started}ms`);

  console.log('\nVerificando que la primera página exista…');
  const head = await fetch(pages[0] as string, { method: 'HEAD' });
  if (!head.ok) fail(`La primera página respondió ${head.status}.`);
  console.log(`  ${head.status} ${head.headers.get('content-type') ?? ''}`);

  // Ráfaga contra el limitador: 15 requests disparadas juntas no pueden salir
  // a más de 5 por segundo, así que el conjunto tarda como mínimo 2 segundos.
  console.log('\nProbando el limitador con 15 requests simultáneas…');
  const burstStart = Date.now();
  await Promise.all(results.slice(0, 3).flatMap((m) => [
    getManga(m.id),
    getManga(m.id),
    getManga(m.id),
    getManga(m.id),
    getManga(m.id),
  ]));
  const elapsed = Date.now() - burstStart;
  console.log(`  15 requests en ${elapsed}ms`);
  if (elapsed < 2_000) fail(`La ráfaga salió en ${elapsed}ms: el límite de 5 req/s no se respetó.`);

  console.log('\n✅ Smoke test OK — sin 429.');
}

main().catch((error: unknown) => {
  if (error instanceof MangaDexError) fail(`MangaDexError ${error.status}: ${error.message}`);
  fail(String(error));
});
