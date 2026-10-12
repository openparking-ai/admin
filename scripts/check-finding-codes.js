#!/usr/bin/env node
// Every finding the rate engine can return has its own sentence here, and
// every sentence here is for a finding the engine can return (U7g fix 1, F6).
//
// The engine's codes are READ FROM THE ENGINE -- `ALL_CODES` in
// src/rate_engine/findings.py, imported by Python from the engine's own source
// at the commit in rate-engine.pin (the engine the recorded answers in
// test/platform-shapes.json were priced by) -- never copied into this repository.
// They are compared with FINDING_CODES in src/rates.js both ways: a code the
// engine gained that has no sentence, and a sentence for a code it no longer has.
//
//   node scripts/check-finding-codes.js
//
// RATE_ENGINE_SRC names a checkout of the engine to read; its HEAD must be the
// pin. Without it the engine is fetched at the pin (git, one commit deep) into
// node_modules/.cache/rate-engine/<pin> and read from there.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FINDING_CODES } from '../src/rates.js';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const ENGINE_REPO = 'https://github.com/openparking-ai/rate-engine';

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

const pin = readFileSync(join(ROOT, 'rate-engine.pin'), 'utf8').trim();
if (!/^[0-9a-f]{40}$/.test(pin)) {
  console.error(`rate-engine.pin is not a whole commit id: ${JSON.stringify(pin)}`);
  process.exit(1);
}

/** A checkout of the engine at the pin: the one named, held to the pin, or one fetched. */
function engineAtPin() {
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

/** `ALL_CODES`, as the engine's own module says it. Python, isolated, the engine's source alone on its path. */
function readEngineCodes(src) {
  const out = sh('python3', ['-I', '-c', 'import json, sys; sys.path.insert(0, sys.argv[1]); from rate_engine.findings import ALL_CODES; print(json.dumps(list(ALL_CODES)))', join(src, 'src')]);
  const codes = JSON.parse(out);
  if (!Array.isArray(codes) || codes.length < 5 || !codes.every((c) => typeof c === 'string')) throw new Error(`the engine's ALL_CODES read back as ${out}`);
  return codes;
}

try {
  const src = engineAtPin();
  const engineCodes = readEngineCodes(src);
  const ours = new Set(FINDING_CODES);
  const theirs = new Set(engineCodes);
  const unworded = engineCodes.filter((c) => !ours.has(c));
  const stale = FINDING_CODES.filter((c) => !theirs.has(c));
  console.log(`  the engine at ${pin.slice(0, 7)} can return ${engineCodes.length} finding codes; these screens word ${FINDING_CODES.length}`);
  for (const c of unworded) console.log(`  FAIL ${c}: the engine can return it, and these screens have no sentence of its own for it`);
  for (const c of stale) console.log(`  FAIL ${c}: a sentence for a code the engine at the pin cannot return`);
  if (unworded.length || stale.length) process.exit(1);
  console.log('  ok   every finding code the engine can return has its own sentence, and no other');
} catch (err) {
  console.error(`  FAIL the engine's codes could not be read: ${err.message}`);
  process.exit(1);
}
