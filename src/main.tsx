import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { loadCatalogFilters } from './api/filters';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el nodo #root');

// Los filtros del catálogo se leen de forma síncrona en cada consulta, así que
// hay que tenerlos antes de que la primera pantalla pida nada. Va encadenado y
// no con `await` de nivel superior, que el target del build no admite.
void loadCatalogFilters().finally(() => {
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});
