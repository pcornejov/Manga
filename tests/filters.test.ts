import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRevision } from '../src/api/filters';

test('a unos ajustes viejos les agrega el catálogo erótico una sola vez', () => {
  const viejos = { languages: ['es'], contentRating: ['safe', 'suggestive'] };
  const migrados = applyRevision(viejos);
  assert.deepEqual(migrados.contentRating, ['safe', 'suggestive', 'erotica']);
  assert.equal(migrados.revision, 1);

  // Y si después se apaga a mano, la revisión ya está marcada: no vuelve a subir.
  const apagado = applyRevision({ ...migrados, contentRating: ['safe'] });
  assert.deepEqual(apagado.contentRating, ['safe']);
});

test('respeta el orden del selector y no repite', () => {
  const desordenado = { languages: ['en'], contentRating: ['erotica', 'safe'] };
  assert.deepEqual(applyRevision(desordenado).contentRating, ['safe', 'erotica']);
});

test('no toca los idiomas', () => {
  const entrada = { languages: ['es-la', 'pt-br'], contentRating: ['safe'] };
  assert.deepEqual(applyRevision(entrada).languages, ['es-la', 'pt-br']);
});
