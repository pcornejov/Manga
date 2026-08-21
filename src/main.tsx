import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './index.css';

// Autoactualización: es de uso personal, no hay que avisarle a nadie del cambio.
registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) throw new Error('No se encontró el nodo #root');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
