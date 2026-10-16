// The rate engine at this repository's pin (rate-engine.pin): its source,
// fetched once into node_modules/.cache (or named by RATE_ENGINE_SRC, held to
// the pin), and the engine itself served on a loopback port. The engine is
// Python with no dependencies, so `python3` is all it needs. Used by the
// finding-codes and currency-digits checks and by the stand-in platform (test/stub-platform.js),
// which prices every stay through it, as the platform does.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const ENGINE_REPO = 'https://github.com/openparking-ai/rate-engine';

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

/** The pin: a whole commit id. */
export function enginePin() {
  const pin = readFileSync(join(ROOT, 'rate-engine.pin'), 'utf8').trim();
  if (!/^[0-9a-f]{40}$/.test(pin)) throw new Error(`rate-engine.pin is not a whole commit id: ${JSON.stringify(pin)}`);
  return pin;
}

/** A checkout of the engine at the pin: the one named, held to the pin, or one fetched. */
export function engineAtPin() {
  const pin = enginePin();
  if (process.env.RATE_ENGINE_SRC) {
    const src = resolve(process.env.RATE_ENGINE_SRC);
    const head = sh('git', ['-C', src, 'rev-parse', 'HEAD']);
    if (head !== pin) throw new Error(`RATE_ENGINE_SRC (${src}) is at ${head}, not at the pin ${pin}`);
    return src;
  }
  const src = join(ROOT, 'node_modules', '.cache', 'rate-engine', pin);
  if (!existsSync(join(src, 'src', 'rate_engine', 'findings.py'))) {
    mkdirSync(src, { recursive: true });
    sh('git', ['init', '-q', src]);
    sh('git', ['-C', src, 'fetch', '-q', '--depth', '1', ENGINE_REPO, pin]);
    sh('git', ['-C', src, 'checkout', '-q', 'FETCH_HEAD']);
  }
  const head = sh('git', ['-C', src, 'rev-parse', 'HEAD']);
  if (head !== pin) throw new Error(`the fetched engine is at ${head}, not at the pin ${pin}`);
  return src;
}

/**
 * The engine's own currency table at the pin: `MINOR_UNIT_DIGITS` in
 * src/rate_engine/currency.py, code to how many digits after the point, read
 * by Python from the engine's source alone (`python3 -I`), never copied.
 */
export function engineCurrencyDigits() {
  const src = join(engineAtPin(), 'src');
  const out = sh('python3', ['-I', '-c', 'import json, sys; sys.path.insert(0, sys.argv[1]); from rate_engine.currency import MINOR_UNIT_DIGITS; print(json.dumps(MINOR_UNIT_DIGITS, sort_keys=True))', src]);
  const table = JSON.parse(out);
  if (!table || typeof table !== 'object' || Array.isArray(table) || Object.keys(table).length < 100 || !Object.values(table).every((d) => Number.isInteger(d))) {
    throw new Error(`the engine's MINOR_UNIT_DIGITS read back as ${out.slice(0, 200)}`);
  }
  return table;
}

const freePort = () =>
  new Promise((done, fail) => {
    const s = createServer();
    s.unref();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => done(port));
    });
  });

/**
 * The engine at the pin, served on a loopback port, isolated (`python3 -I`,
 * the engine's source alone on its path). `{ url, stop }`. Waits for its
 * health answer; refuses after `timeoutMs`.
 */
export async function startEngine({ timeoutMs = 20_000 } = {}) {
  const src = join(engineAtPin(), 'src');
  const port = await freePort();
  const child = spawn('python3', ['-I', '-c', `import sys; sys.path.insert(0, sys.argv[1]); from rate_engine.service import serve; serve('127.0.0.1', ${port})`, src], { stdio: ['ignore', 'ignore', 'pipe'] });
  let said = '';
  child.stderr.on('data', (d) => {
    said += d;
  });
  const url = `http://127.0.0.1:${port}`;
  const until = Date.now() + timeoutMs;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the rate engine stopped as it started: ${said.slice(0, 400)}`);
    try {
      const res = await fetch(`${url}/v1/health`);
      if (res.ok) break;
    } catch {
      // Not listening yet.
    }
    if (Date.now() > until) {
      child.kill();
      throw new Error(`the rate engine did not answer within ${timeoutMs} ms: ${said.slice(0, 400)}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    url,
    stop: () =>
      new Promise((done) => {
        if (child.exitCode !== null) return done();
        child.once('exit', () => done());
        child.kill();
      }),
  };
}
