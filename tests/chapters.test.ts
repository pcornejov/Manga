import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chaptersByLanguage,
  dedupeChapters,
  isReadable,
  preferredLanguage,
} from '../src/api/mangadex';
import type { Chapter } from '../src/api/types';

/** Capítulo mínimo con lo que miran las funciones bajo prueba. */
function chapter(overrides: {
  id: string;
  chapter?: string | null;
  language?: string;
  pages?: number;
  publishAt?: string;
  externalUrl?: string | null;
  isUnavailable?: boolean;
}): Chapter {
  return {
    id: overrides.id,
    type: 'chapter',
    attributes: {
      volume: null,
      // `?? '1'` no sirve: un `chapter: null` explícito debe quedar en null.
      chapter: 'chapter' in overrides ? overrides.chapter ?? null : '1',
      title: null,
      translatedLanguage: overrides.language ?? 'es',
      externalUrl: overrides.externalUrl ?? null,
      isUnavailable: overrides.isUnavailable ?? false,
      publishAt: overrides.publishAt ?? '2024-01-01T00:00:00+00:00',
      readableAt: '2024-01-01T00:00:00+00:00',
      createdAt: '2024-01-01T00:00:00+00:00',
      updatedAt: '2024-01-01T00:00:00+00:00',
      pages: overrides.pages ?? 20,
      version: 1,
    },
    relationships: [],
  };
}

test('isReadable descarta los capítulos que la app no puede abrir', () => {
  assert.equal(isReadable(chapter({ id: 'a' })), true);
  // Obras licenciadas: sólo enlazan al lector oficial.
  assert.equal(
    isReadable(chapter({ id: 'b', externalUrl: 'https://mangaplus.shueisha.co.jp/x', pages: 0 })),
    false,
  );
  assert.equal(isReadable(chapter({ id: 'c', isUnavailable: true })), false);
  assert.equal(isReadable(chapter({ id: 'd', pages: 0 })), false);
});

test('dedupeChapters deja una sola versión por número', () => {
  const resultado = dedupeChapters([
    chapter({ id: 'a', chapter: '1', pages: 33 }),
    chapter({ id: 'b', chapter: '1', pages: 37 }),
    chapter({ id: 'c', chapter: '1', pages: 32 }),
    chapter({ id: 'd', chapter: '2', pages: 24 }),
  ]);
  assert.equal(resultado.length, 2);
  // Gana la más completa.
  assert.equal(resultado[0]?.id, 'b');
});

test('dedupeChapters usa la más antigua cuando empatan en páginas', () => {
  const resultado = dedupeChapters([
    chapter({ id: 'nueva', chapter: '5', pages: 20, publishAt: '2024-06-01T00:00:00+00:00' }),
    chapter({ id: 'vieja', chapter: '5', pages: 20, publishAt: '2023-01-01T00:00:00+00:00' }),
  ]);
  assert.equal(resultado.length, 1);
  assert.equal(resultado[0]?.id, 'vieja');
});

test('dedupeChapters no junta oneshots distintos', () => {
  const resultado = dedupeChapters([
    chapter({ id: 'a', chapter: null }),
    chapter({ id: 'b', chapter: null }),
  ]);
  assert.equal(resultado.length, 2);
});

test('preferredLanguage elige español antes que inglés', () => {
  const chapters = [
    chapter({ id: 'a', language: 'en' }),
    chapter({ id: 'b', language: 'en' }),
    chapter({ id: 'c', language: 'es' }),
  ];
  assert.equal(preferredLanguage(chapters), 'es');
});

test('entre variantes del español gana la que tiene más capítulos', () => {
  const chapters = [
    chapter({ id: 'a', language: 'es' }),
    chapter({ id: 'b', language: 'es-la' }),
    chapter({ id: 'c', language: 'es-la' }),
    chapter({ id: 'd', language: 'es-la' }),
  ];
  assert.equal(preferredLanguage(chapters), 'es-la');
});

test('el inglés queda si no hay nada en español', () => {
  assert.equal(preferredLanguage([chapter({ id: 'a', language: 'en' })]), 'en');
  assert.equal(preferredLanguage([]), null);
});

test('chaptersByLanguage separa sin perder capítulos', () => {
  const grupos = chaptersByLanguage([
    chapter({ id: 'a', language: 'es-la' }),
    chapter({ id: 'b', language: 'en' }),
    chapter({ id: 'c', language: 'es-la' }),
  ]);
  assert.equal(grupos.get('es-la')?.length, 2);
  assert.equal(grupos.get('en')?.length, 1);
});
