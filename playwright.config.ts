import { defineConfig } from '@playwright/test';

/**
 * Los tests corren contra el build servido por `vite preview`, que es donde el
 * Service Worker y el proxy se comportan como en producción.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 390, height: 844 },
    /**
     * Sin Service Worker: sus pedidos no pasan por `page.route`, así que con él
     * activo los tests salían a la API real y dependían de la red. El
     * comportamiento offline se verifica aparte.
     */
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
