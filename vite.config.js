import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Where `npm run dev` sends /api, so the page and the platform share one
// origin, as they must: the platform's sign-in cookie is for /api on the
// page's own origin. Development only; the built site holds no address and
// always asks its own origin.
const PLATFORM = process.env.OPENPARKING_PLATFORM || 'http://127.0.0.1:3000';

// With the platform stopped, the proxy answers as a gateway does, a 502 with
// no body, so the screens say the platform cannot be reached. (Left to
// itself it answers a 500, which reads as "something went wrong".)
const answerAsAGateway = (proxy) =>
  proxy.on('error', (_error, _req, res) => {
    if (res && typeof res.writeHead === 'function' && !res.headersSent && !res.writableEnded) res.writeHead(502).end();
  });

// The page policy in index.html allows nothing inline. The development server
// works by putting a script and styles inline, so it serves the page without
// the policy; the built site always carries it.
const policyOnlyWhenBuilt = {
  name: 'policy-only-when-built',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace(/\s*<meta\s+http-equiv="Content-Security-Policy"[^>]*\/>/, ''),
};

export default defineConfig({
  plugins: [react(), policyOnlyWhenBuilt],
  // Relative asset paths, so the built site works from any folder a garage
  // serves it from.
  base: './',
  server: {
    proxy: { '/api': { target: PLATFORM, configure: answerAsAGateway } },
  },
  build: {
    // Fonts stay files beside the page instead of being inlined as data.
    assetsInlineLimit: 0,
    // Never publish source maps: they would hand out the source and its comments.
    sourcemap: false,
  },
});
