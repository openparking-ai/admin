import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as listen } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { createClient } from '../src/api.js';
import { translate } from '../src/i18n/index.js';
import { problemKey } from '../src/api.js';

// `npm run dev` with the platform stopped: the development server, from this
// repository's own vite.config.js, sends /api to an address nothing answers.
// The screens must say the platform cannot be reached, not that something
// went wrong on our side.

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** An address on this computer that nothing is listening on. */
async function nobodyThere() {
  const server = listen();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return `http://127.0.0.1:${port}`;
}

test('the platform stopped behind the development proxy: "cannot be reached", in both languages', async () => {
  const before = process.env.OPENPARKING_PLATFORM;
  process.env.OPENPARKING_PLATFORM = await nobodyThere();
  const dev = await createServer({ root: ROOT, logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
  try {
    await dev.listen();
    const base = dev.resolvedUrls.local[0].replace(/\/$/, '');
    const client = createClient({ fetch: (url, init) => fetch(`${base}${url}`, init) });
    for (const [what, call] of [
      ['signing in', () => client.signIn('a@example.com', 'pw')],
      ['who is signed in', () => client.me()],
      ['a read', () => client.garages()],
    ]) {
      let problem = null;
      try {
        await call();
      } catch (p) {
        problem = p;
      }
      assert.equal(problem?.kind, 'unreachable', `${what}: the platform stopped behind the development proxy`);
      for (const language of ['en', 'es']) {
        assert.equal(translate(language, problemKey(problem)), translate(language, 'problem.unreachable'), `${what} (${language})`);
      }
    }
  } finally {
    await dev.close();
    if (before === undefined) delete process.env.OPENPARKING_PLATFORM;
    else process.env.OPENPARKING_PLATFORM = before;
  }
});
