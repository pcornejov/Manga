/**
 * Genera los íconos de la app desde una sola marca vectorial.
 *
 * Los PNG del manifiesto son artefactos: tenerlos sin la fuente obliga a
 * redibujar a mano cada vez que cambia algo. Se rasterizan con el Chromium que
 * ya trae Playwright, así no hace falta otra dependencia sólo para esto.
 *
 *   node scripts/build-icons.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

/** Baldosa: degradado oscuro con un resplandor cálido arriba a la izquierda. */
function fondo(id, radius) {
  return `
  <defs>
    <linearGradient id="bg-${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1e1e34"/><stop offset="0.55" stop-color="#101019"/>
      <stop offset="1" stop-color="#08080c"/>
    </linearGradient>
    <radialGradient id="gl-${id}" cx="0.26" cy="0.16" r="0.8">
      <stop offset="0" stop-color="#f97316" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#f97316" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="${radius}" fill="url(#bg-${id})"/>
  <rect width="512" height="512" rx="${radius}" fill="url(#gl-${id})"/>`;
}

/**
 * La marca: una página de manga inclinada, con la viñeta activa en naranja y un
 * globo de diálogo dentro. La retícula sola se leía como una app de maquetación;
 * el globo es lo que la vuelve historieta de un vistazo.
 *
 * `detalle` en `false` saca la sombra: a 64 px o menos deja de ser volumen y
 * pasa a ser suciedad alrededor del dibujo.
 */
function marca(id, detalle) {
  const sombra = detalle
    ? `<filter id="sh-${id}" x="-30%" y="-30%" width="160%" height="160%">
         <feDropShadow dx="0" dy="2.5" stdDeviation="2.6" flood-color="#000" flood-opacity="0.5"/>
       </filter>`
    : '';
  return `
  <defs>
    <linearGradient id="pp-${id}" x1="0.1" y1="0" x2="0.45" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3d3e3"/>
    </linearGradient>
    <linearGradient id="oa-${id}" x1="0" y1="0" x2="0.55" y2="1">
      <stop offset="0" stop-color="#fda34f"/><stop offset="1" stop-color="#e2600a"/>
    </linearGradient>
    ${sombra}
  </defs>
  <g transform="rotate(-6 50 50)" ${detalle ? `filter="url(#sh-${id})"` : ''}
     stroke-linejoin="round" stroke-width="3.5">
    <rect x="4.75" y="4.75" width="90.5" height="26.5" rx="2"
          fill="url(#pp-${id})" stroke="url(#pp-${id})"/>
    <path d="M4.75 39.75 H52.6 L44.3 94.25 H4.75 Z" fill="url(#pp-${id})" stroke="url(#pp-${id})"/>
    <path d="M61.4 39.75 H95.25 V94.25 H51.7 Z" fill="url(#oa-${id})" stroke="url(#oa-${id})"/>
    <g stroke="none" fill="#ffffff">
      <path d="M64.5 76.5 L66.5 66 L72 71 Z"/>
      <ellipse cx="77" cy="61" rx="14.5" ry="10"/>
    </g>
  </g>`;
}

/** El SVG completo, siempre con caja de 512 para que las proporciones no cambien. */
function icono({ id, escala, radius, detalle }) {
  const off = (512 - escala) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
${fondo(id, radius)}
<g transform="translate(${off} ${off}) scale(${escala / 100})">${marca(id, detalle)}</g>
</svg>`;
}

/*
 * `escala` es cuánto del lado ocupa la marca.
 *
 * En el maskable tiene que caber entera en el círculo interior del 80 % que
 * recortan Android y Chrome: 280 de lado da una diagonal de 396 contra los 409
 * disponibles. Y va a sangre, sin esquinas redondeadas, porque las pone el
 * sistema.
 */
const SALIDAS = [
  { archivo: 'icon-512.png', size: 512, escala: 330, radius: 112, detalle: true },
  { archivo: 'icon-192.png', size: 192, escala: 330, radius: 112, detalle: true },
  { archivo: 'icon-64.png', size: 64, escala: 380, radius: 112, detalle: false },
  { archivo: 'icon-maskable-512.png', size: 512, escala: 280, radius: 0, detalle: true },
  { archivo: 'apple-touch-icon.png', size: 180, escala: 330, radius: 0, detalle: true },
];

mkdirSync(PUBLIC, { recursive: true });

// El favicon va en vectorial: la pestaña lo pide a tamaños que cambian según el
// navegador y la densidad de pantalla.
writeFileSync(
  join(PUBLIC, 'favicon.svg'),
  `${icono({ id: 'fav', escala: 380, radius: 112, detalle: false })}\n`,
);

const browser = await chromium.launch();
try {
  for (const { archivo, size, ...resto } of SALIDAS) {
    const svg = icono({ id: archivo.replace(/\W/g, ''), ...resto }).replace(
      'width="512" height="512"',
      `width="${size}" height="${size}"`,
    );
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0">${svg}</body>`);
    await page.locator('svg').screenshot({ path: join(PUBLIC, archivo) });
    await page.close();
    console.log(`✅ ${archivo} — ${size}×${size}`);
  }
} finally {
  await browser.close();
}
console.log('✅ favicon.svg');
