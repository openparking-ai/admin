import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import './styles.css';
import { createTheme } from './theme.js';
import { createClient } from './api.js';
import { takeLink } from './links.js';
import App from './App.jsx';

// U7d-2: an emailed link's token, taken out of the address before anything
// else runs or is drawn, so it is never left there (src/links.js).
const link = takeLink(window.location, window.history);

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
    <App theme={theme} storage={storage} client={client} link={link} />
  </StrictMode>,
);
