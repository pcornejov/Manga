import assert from 'node:assert/strict';
import test from 'node:test';
import { RequestQueue } from '../src/api/rateLimiter';

const now = (): number => Date.now();

test('respeta el límite de arranques por ventana', async () => {
  const queue = new RequestQueue(5, 1_000, 'prueba');
  const inicio = now();
  const arranques: number[] = [];

  await Promise.all(
    Array.from({ length: 12 }, () =>
      queue.run(async () => {
        arranques.push(now() - inicio);
      }),
    ),
  );

  assert.equal(arranques.length, 12);
  // 12 arranques a 5 por segundo no pueden entrar en menos de dos ventanas.
  const ultimo = Math.max(...arranques);
  assert.ok(ultimo >= 2_000, `el último arrancó a los ${ultimo}ms, demasiado pronto`);
});

test('minGapMs separa los arranques de forma pareja', async () => {
  // El host de portadas acepta 5 req/s sólo si llegan espaciadas.
  const queue = new RequestQueue(5, 1_000, 'portadas', 200);
  const marcas: number[] = [];

  await Promise.all(
    Array.from({ length: 5 }, () =>
      queue.run(async () => {
        marcas.push(now());
      }),
    ),
  );

  marcas.sort((a, b) => a - b);
  for (let i = 1; i < marcas.length; i += 1) {
    const hueco = (marcas[i] ?? 0) - (marcas[i - 1] ?? 0);
    assert.ok(hueco >= 180, `hueco de ${hueco}ms entre arranques, esperaba ~200ms`);
  }
});

test('pauseFor frena la cola entera', async () => {
  const queue = new RequestQueue(5, 1_000, 'prueba');
  queue.pauseFor(400);
  const inicio = now();
  await queue.run(async () => undefined);
  const transcurrido = now() - inicio;
  assert.ok(transcurrido >= 380, `arrancó a los ${transcurrido}ms pese a la pausa`);
});

test('propaga el error sin trabar la cola', async () => {
  const queue = new RequestQueue(5, 1_000, 'prueba');
  await assert.rejects(
    queue.run(async () => {
      throw new Error('falla');
    }),
    /falla/,
  );
  assert.equal(await queue.run(async () => 'sigue viva'), 'sigue viva');
});
