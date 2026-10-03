import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import { createTheme } from './theme.js';
import { createClient } from './api.js';
import App from './App.jsx';

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

// Applied before the first paint, so a night choice never flashes white.
const theme = createTheme({
  storage,
  matchMedia: window.matchMedia?.bind(window),
  root: document.documentElement,
});

const client = createClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App theme={theme} storage={storage} client={client} />
  </StrictMode>,
);
