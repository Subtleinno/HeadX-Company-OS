import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-600.css';
import './styles.css';
import { App } from './App';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('找不到 #root');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
