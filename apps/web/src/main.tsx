import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@company-os/design-tokens/tokens.css';
import './styles/app.css';
import './styles/frame.css';
import './styles/admin.css';
import './styles/files.css';
import './styles/needs.css';
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
