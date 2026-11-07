import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@company-os/design-tokens/tokens.css';
import './styles/app.css';
import './styles/base-shell.css';
import './styles/admin.css';
import { App } from './App';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Missing #root element');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
