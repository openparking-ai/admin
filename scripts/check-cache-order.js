#!/usr/bin/env node
// Nothing restored from a cache is read, loaded or run before it is verified
// (U5 fix 16, handover 2026-10-09 10:55). Re-gate 14 put a file in the cached
// browsers that Playwright ran during its install, before the browser check
// read the tree, and the file erased itself. So the order is the rule: the
// step right after every cache restore, in every workflow and action under
// .github/, is the verify step, and nothing comes between.
//
// Read with a YAML parser. For every step list (a workflow job's, a composite
// action's), each of these is named with its file and step:
//   - `actions/cache` itself (it restores, then saves after the job, with no
//     step between the restore and the first reader), or a `setup-*` action
//     asked to cache (`cache:`): its restore has no verify step at all.
//   - an `actions/cache/restore` step with no `id`, or whose next step is not
//     exactly one line, `python3 -I .github/scripts/verify-installs.py
//     restored KIND "$KEY" "$MATCHED" ...`, with KEY and MATCHED that
//     restore's own `cache-primary-key` and `cache-matched-key`, under the
//     same `if:`, naming every folder the restore puts back.
//   - `restore-keys` on a restore whose KIND is not `debs`: only a set of
//     packages may come from another key, and verify-installs.py checks it
//     package by package before apt reads it.
//
//   node scripts/check-cache-order.js

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const GITHUB = join(ROOT, '.github');
const VERIFY = 'python3 -I .github/scripts/verify-installs.py restored ';

const isMapping = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const yamlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? yamlFiles(join(dir, e.name)) : /\.ya?ml$/i.test(e.name) ? [join(dir, e.name)] : []));
const label = (step, i) => `step ${i + 1}${isMapping(step) && step.name ? ` "${step.name}"` : isMapping(step) && step.uses ? ` (${step.uses})` : ''}`;
const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
const output = (id, what) => `\${{ steps.${id}.outputs.${what} }}`;

const failed = [];
let restores = 0;
let lists = 0;

function checkSteps(where, steps) {
  lists += 1;
  steps.forEach((step, i) => {
    if (!isMapping(step) || typeof step.uses !== 'string') return;
    const at = `${where}, ${label(step, i)}`;
    if (/^actions\/cache@/.test(step.uses)) {
      failed.push(`${at}: actions/cache restores with no verify step after it; use actions/cache/restore, then verify-installs.py restored`);
      return;
    }
    if (/^actions\/setup-[\w-]+@/.test(step.uses) && isMapping(step.with) && (step.with.cache !== undefined || step.with['cache-dependency-path'] !== undefined)) {
      failed.push(`${at}: ${step.uses.split('@')[0]} asked to cache restores with no verify step after it`);
      return;
    }
    if (!/^actions\/cache\/restore@/.test(step.uses)) return;
    restores += 1;
    if (typeof step.id !== 'string' || !step.id) {
      failed.push(`${at}: a cache restore with no id, so its verify step cannot name it`);
      return;
    }
    const next = steps[i + 1];
    const nextAt = `${where}, ${label(next, i + 1)}`;
    const run = isMapping(next) && typeof next.run === 'string' ? next.run.trim() : null;
    if (run === null || next.uses !== undefined || run.includes('\n') || !run.startsWith(VERIFY)) {
      failed.push(`${at}: the step after it is not the verify step (one line: ${VERIFY.trim()} ...); ${next === undefined ? 'there is none' : `it is ${label(next, i + 1)}`}`);
      return;
    }
    const tokens = run.slice(VERIFY.length).split(/\s+/);
    const kind = tokens[0];
    const env = isMapping(next.env) ? next.env : {};
    if (!same(env.KEY, output(step.id, 'cache-primary-key')) || !same(env.MATCHED, output(step.id, 'cache-matched-key')) || tokens[1] !== '"$KEY"' || tokens[2] !== '"$MATCHED"') {
      failed.push(`${nextAt}: verifies with KEY and MATCHED other than "${step.id}"'s own cache-primary-key and cache-matched-key`);
    }
    if (!same(next.if, step.if)) failed.push(`${nextAt}: runs under ${next.if === undefined ? 'no condition' : `"${next.if}"`}, not the restore's ${step.if === undefined ? 'none' : `"${step.if}"`}`);
    const paths = String(isMapping(step.with) ? step.with.path ?? '' : '').split('\n').map((p) => p.trim()).filter(Boolean);
    for (const path of paths) {
      const asArgument = `"${path.replace(/^~\//, '$HOME/')}"`;
      if (!tokens.includes(asArgument)) failed.push(`${nextAt}: does not verify ${path}, which "${step.id}" restores`);
    }
    if (isMapping(step.with) && step.with['restore-keys'] !== undefined && kind !== 'debs') {
      failed.push(`${at}: restore-keys on a ${kind} cache; only a set of packages may come from another key`);
    }
  });
}

for (const path of yamlFiles(GITHUB).sort()) {
  const name = relative(GITHUB, path);
  let doc;
  try {
    doc = yaml.load(readFileSync(path, 'utf8'), { filename: name });
  } catch (error) {
    failed.push(`${name}: not readable as YAML (${error.reason ?? error.message}), so its caches cannot be checked`);
    continue;
  }
  if (!isMapping(doc)) continue;
  if (isMapping(doc.jobs)) {
    for (const [job, body] of Object.entries(doc.jobs)) if (isMapping(body) && Array.isArray(body.steps)) checkSteps(`${name}, job "${job}"`, body.steps);
  }
  if (isMapping(doc.runs) && Array.isArray(doc.runs.steps)) checkSteps(name, doc.runs.steps);
}

for (const m of failed) console.log(`  FAIL ${m}`);
if (failed.length || restores === 0) {
  console.error(`\ncache order — ${failed.length} failed, of ${restores} cache restores in ${lists} step lists.`);
  process.exit(1);
}
console.log(`cache order — all ${restores} cache restores in ${lists} step lists are verified in the very next step, before anything reads them; no cache restores without one.`);
