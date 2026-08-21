import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBytes } from '../src/api/downloads';
import { buildUrl } from '../src/api/client';
import { chapterLabel, pickLocalized, volumeLabel } from '../src/api/mangadex';
import type { Chapter } from '../src/api/types';

test('formatBytes usa la unidad que corresponde', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(2048), '2.0 kB');
  assert.equal(formatBytes(3_600_000), '3.4 MB');
  assert.equal(formatBytes(0), '0 B');
});

test('pickLocalized prefiere español y cae al primero que haya', () => {
  assert.equal(pickLocalized({ en: 'Hello', es: 'Hola' }), 'Hola');
  assert.equal(pickLocalized({ en: 'Hello' }), 'Hello');
  assert.equal(pickLocalized({ ko: 'Annyeong' }), 'Annyeong');
  assert.equal(pickLocalized({}, 'nada'), 'nada');
});

test('buildUrl repite los parámetros de array como pide MangaDex', () => {
  const url = buildUrl('/manga', { title: 'Frieren', includes: ['cover_art', 'author'], limit: 5 });
  assert.ok(url.includes('title=Frieren'));
  assert.ok(url.includes('includes%5B%5D=cover_art'));
  assert.ok(url.includes('includes%5B%5D=author'));
  assert.ok(url.includes('limit=5'));
});

test('buildUrl omite los parámetros sin valor', () => {
  const url = buildUrl('/manga', { title: 'x', offset: undefined });
  assert.ok(!url.includes('offset'));
});

function chapter(number: string | null, title: string | null, volume: string | null): Chapter {
  return {
    id: 'x',
    type: 'chapter',
    attributes: {
      volume,
      chapter: number,
      title,
      translatedLanguage: 'es',
      externalUrl: null,
      publishAt: '',
      readableAt: '',
      createdAt: '',
      updatedAt: '',
      pages: 10,
      version: 1,
    },
    relationships: [],
  };
}

test('las etiquetas de capítulo y volumen contemplan los huecos', () => {
  assert.equal(chapterLabel(chapter('7', 'El duelo', '2')), 'Cap. 7 — El duelo');
  assert.equal(chapterLabel(chapter('7', null, null)), 'Cap. 7');
  assert.equal(chapterLabel(chapter(null, null, null)), 'Oneshot');
  assert.equal(volumeLabel(chapter('1', null, '3')), 'Volumen 3');
  assert.equal(volumeLabel(chapter('1', null, null)), 'Sin volumen');
});
