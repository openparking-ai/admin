#!/usr/bin/env node
// Nothing restored from a cache is read, loaded or run before it is verified
// (U5 fix 16, handover 2026-10-09 10:55), and a refused verify stops the job
// (U5 fix 18, 12:10). Re-gate 14 put a file in the cached browsers that
// Playwright ran during its install, before the browser check read the tree,
// and the file erased itself. So the order is the rule: the step right after
// every cache restore, in every workflow and action under .github/, is the
// verify step, and nothing comes between. Re-gate 16 then showed that a step
// recognised by its first line can still be told to go on after a refusal
// (`|| true`, `continue-on-error: true`), so the verify step is now pinned
// whole, and nothing that lets a job go on past a failed step is allowed.
//
// Read with a YAML parser. For every step list (a workflow job's, a composite
// action's), each of these is named with its file, job and step:
//   - `actions/cache` itself (it restores, then saves after the job, with no
//     step between the restore and the first reader), or a `setup-*` action
//     asked to cache (`cache:`): its restore has no verify step at all.
//   - an `actions/cache/restore` step with no `id`, or whose next step is not
//     exactly one line, `python3 -I .github/scripts/verify-installs.py
//     restored KIND "$KEY" "$MATCHED" ...`, with KEY and MATCHED that
//     restore's own `cache-primary-key` and `cache-matched-key`, under the
//     same `if:`, naming every folder the restore puts back.
//   - a verify step that is not, key for key and byte for byte, its entry in
//     scripts/cache-verify-steps.yml (an entry no restore uses is named too,
//     and every entry is held to `shell: bash`, the keys name/if/shell/env/run
//     and one line with no shell operator).
//   - `restore-keys` on a restore whose KIND is not `debs`: only a set of
//     packages may come from another key, and verify-installs.py checks it
//     package by package before apt reads it.
//   - after a verify step, or after a step using one of this repository's
//     actions that holds one, a step whose `if:` uses always(), failure() or
//     cancelled() -- it would run after a refusal. The one form allowed, in a
//     workflow, is `!cancelled() && steps.ID.outcome == 'success'`, ID being
//     that action step's own id: it runs after a later step fails, never
//     after the verify did.
// And in every workflow and action under .github/, anywhere:
//   - `continue-on-error`, at step or job level;
//   - `defaults: run: shell:` at workflow or job level, so GitHub's own
//     `bash -e` stays in force for every `run:`.
//
//   node scripts/check-cache-order.js

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const GITHUB = join(ROOT, '.github');
const VERIFY = 'python3 -I .github/scripts/verify-installs.py restored ';
const TEMPLATES = 'scripts/cache-verify-steps.yml';
const TEMPLATE_KEYS = ['name', 'if', 'shell', 'env', 'run'];
const STATUS = /\b(always|failure|cancelled)\s*\(/;
const AFTER_OK = (id) => `!cancelled() && steps.${id}.outcome == 'success'`;

const isMapping = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const yamlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? yamlFiles(join(dir, e.name)) : /\.ya?ml$/i.test(e.name) ? [join(dir, e.name)] : []));
const label = (step, i) => `step ${i + 1}${isMapping(step) && step.name ? ` "${step.name}"` : isMapping(step) && step.uses ? ` (${step.uses})` : ''}`;
const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
const output = (id, what) => `\${{ steps.${id}.outputs.${what} }}`;

const failed = [];
let restores = 0;
let lists = 0;

// The pinned verify steps, each held to the shape a verify step may have.
let templates = {};
try {
  templates = yaml.load(readFileSync(join(ROOT, TEMPLATES), 'utf8'), { filename: TEMPLATES }) ?? {};
} catch (error) {
  failed.push(`${TEMPLATES}: not readable as YAML (${error.reason ?? error.message}), so no verify step can be held to it`);
}
const unused = new Set();
for (const [file, entries] of Object.entries(isMapping(templates) ? templates : {})) {
  for (const [key, entry] of Object.entries(isMapping(entries) ? entries : {})) {
    const at = `${TEMPLATES}, ${file} "${key}"`;
    unused.add(`${file}\0${key}`);
    if (!isMapping(entry)) {
      failed.push(`${at}: not a step`);
      continue;
    }
    for (const k of Object.keys(entry)) if (!TEMPLATE_KEYS.includes(k)) failed.push(`${at}: has "${k}"; a verify step has ${TEMPLATE_KEYS.join(', ')} only`);
    if (entry.shell !== 'bash') failed.push(`${at}: shell is ${JSON.stringify(entry.shell)}, not "bash" (bash -eo pipefail, so a refusal stops the job)`);
    const run = typeof entry.run === 'string' ? entry.run : '';
    if (!run.startsWith(VERIFY) || run.includes('\n')) failed.push(`${at}: run is not one line starting ${VERIFY.trim()}`);
    const operator = run.match(/[;&|<>`]/);
    if (operator) failed.push(`${at}: run holds the shell operator "${operator[0]}", so it could go on after a refusal`);
    if (entry.env !== undefined && !(isMapping(entry.env) && Object.values(entry.env).every((v) => typeof v === 'string'))) failed.push(`${at}: env is not a list of names and texts`);
  }
}

// What differs between a verify step and its pinned entry, key by key.
function differences(step, entry) {
  if (!isMapping(step)) return ['it is not a step'];
  const out = [];
  for (const k of Object.keys(step)) if (!(k in entry)) out.push(`has "${k}", which its pinned step has not`);
  for (const k of Object.keys(entry)) if (!(k in step)) out.push(`has no "${k}", which its pinned step has`);
  for (const k of Object.keys(entry)) {
    if (!(k in step)) continue;
    if (k === 'env' && isMapping(step.env) && isMapping(entry.env)) {
      for (const n of Object.keys(step.env)) if (!(n in entry.env)) out.push(`env has "${n}", which its pinned step has not`);
      for (const n of Object.keys(entry.env)) if (n in step.env && step.env[n] !== entry.env[n]) out.push(`env "${n}" is ${JSON.stringify(step.env[n])}, not ${JSON.stringify(entry.env[n])}`);
      for (const n of Object.keys(entry.env)) if (!(n in step.env)) out.push(`env has no "${n}", which its pinned step has`);
    } else if (JSON.stringify(step[k]) !== JSON.stringify(entry[k])) {
      out.push(`${k} is ${JSON.stringify(step[k])}, not ${JSON.stringify(entry[k])}`);
    }
  }
  return out;
}

// This repository's own actions that hold a verify step (directly, or through another of its actions).
const localAction = (uses) => (typeof uses === 'string' && /^\.\/\.github\/actions\/[\w-]+$/.test(uses) ? `${uses.slice('./.github/'.length)}/action.yml` : null);
const verifying = new Set();

function checkSteps(where, steps, file, job) {
  lists += 1;
  let after = null; // the step a refusal would have stopped at: { at, id } once a verify is behind
  steps.forEach((step, i) => {
    if (isMapping(step) && after && typeof step.if === 'string' && STATUS.test(step.if)) {
      const allowed = after.id ? AFTER_OK(after.id) : null;
      if (step.if.replace(/^\$\{\{\s*|\s*\}\}$/g, '').trim() !== allowed) {
        failed.push(`${where}, ${label(step, i)}: runs under "${step.if}", so it runs after ${after.at} refused${allowed ? `; the one form allowed is "${allowed}"` : ''}`);
      }
    }
    if (isMapping(step) && localAction(step.uses) && verifying.has(localAction(step.uses))) {
      after = { at: `${label(step, i)}, which verifies a cache,`, id: typeof step.id === 'string' && step.id ? step.id : null };
    }
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
    after = { at: `the verify step ${label(next, i + 1)}`, id: null };
    const key = job ? `${job}/${step.id}` : step.id;
    const entry = isMapping(templates) && isMapping(templates[file]) ? templates[file][key] : undefined;
    if (!isMapping(entry)) {
      failed.push(`${nextAt}: has no pinned step in ${TEMPLATES} (${file} "${key}")`);
    } else {
      unused.delete(`${file}\0${key}`);
      for (const d of differences(next, entry)) failed.push(`${nextAt}: ${d} (${TEMPLATES})`);
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

const docs = [];
for (const path of yamlFiles(GITHUB).sort()) {
  const name = relative(GITHUB, path);
  try {
    const doc = yaml.load(readFileSync(path, 'utf8'), { filename: name });
    if (isMapping(doc)) docs.push([name, doc]);
  } catch (error) {
    failed.push(`${name}: not readable as YAML (${error.reason ?? error.message}), so its caches cannot be checked`);
  }
}

// Which of this repository's actions verify a cache: one that restores one, or uses one that does.
const stepsOf = (doc) => [...(isMapping(doc.runs) && Array.isArray(doc.runs.steps) ? [doc.runs.steps] : []), ...(isMapping(doc.jobs) ? Object.values(doc.jobs).filter((j) => isMapping(j) && Array.isArray(j.steps)).map((j) => j.steps) : [])].flat();
for (let grew = true; grew; ) {
  grew = false;
  for (const [name, doc] of docs) {
    if (verifying.has(name)) continue;
    if (stepsOf(doc).some((st) => isMapping(st) && typeof st.uses === 'string' && (/^actions\/cache\/restore@/.test(st.uses) || verifying.has(localAction(st.uses))))) {
      verifying.add(name);
      grew = true;
    }
  }
}

// Anything that lets a job go on past a failed step, anywhere in the file.
function goesOn(name, node, path) {
  if (Array.isArray(node)) return node.forEach((v, i) => goesOn(name, v, `${path}[${i}]`));
  if (!isMapping(node)) return;
  for (const [k, v] of Object.entries(node)) {
    const here = path ? `${path}.${k}` : k;
    if (k === 'continue-on-error') failed.push(`${name}, ${path || 'the file'}: continue-on-error ${JSON.stringify(v)}; a failed step must stop its job`);
    if (k === 'defaults' && isMapping(v) && isMapping(v.run) && v.run.shell !== undefined) failed.push(`${name}, ${path || 'the workflow'}: defaults.run.shell ${JSON.stringify(v.run.shell)}; every run: keeps GitHub's own bash -e`);
    goesOn(name, v, here);
  }
}

for (const [name, doc] of docs) {
  goesOn(name, doc, '');
  if (isMapping(doc.jobs)) {
    for (const [job, body] of Object.entries(doc.jobs)) if (isMapping(body) && Array.isArray(body.steps)) checkSteps(`${name}, job "${job}"`, body.steps, name, job);
  }
  if (isMapping(doc.runs) && Array.isArray(doc.runs.steps)) checkSteps(name, doc.runs.steps, name, null);
}
for (const left of unused) {
  const [file, key] = left.split('\0');
  failed.push(`${TEMPLATES}, ${file} "${key}": pinned, but no cache restore of that id is there`);
}

for (const m of failed) console.log(`  FAIL ${m}`);
if (failed.length || restores === 0) {
  console.error(`\ncache order — ${failed.length} failed, of ${restores} cache restores in ${lists} step lists.`);
  process.exit(1);
}
console.log(`cache order — all ${restores} cache restores in ${lists} step lists are verified in the very next step, before anything reads them; no cache restores without one.`);
