import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/sora/600.css';
import '@fontsource/sora/700.css';
import './styles/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyTheme, followSystemTheme } from './lib/theme';

applyTheme();
followSystemTheme();

const root = document.getElementById('root');
if (!root) {
  throw new Error('Elemento #root não encontrado.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// App instalável (PWA). Só no build de produção, para não atrapalhar o desenvolvimento.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
