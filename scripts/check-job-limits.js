#!/usr/bin/env node
// Every job in every workflow has a time limit (`timeout-minutes`), so a hang
// stops the job in minutes and is named, never GitHub's 6 hours (main's CI on
// ca917e0 hung 6 h in a browser download). And no limit is over CEILING: a
// limit of 360 is no limit (U5 fix 11, handover 2026-10-08 17:40).
//
// Read with a YAML parser, never line by line (U5 fix 13, handover 20:30): a
// comment after `jobs:`, Windows line ends or any other spelling YAML allows
// cannot hide a job. Every YAML file under .github/ must parse; a workflow
// with no jobs found, a job with no limit, a limit that is not a plain number
// of minutes, or one over the ceiling is named, with its file and job.
//
// And every job runs on RUNNER, never a label that moves (U5 fix 13b, handover
// 2026-10-09 10:10): the system packages are vouched for only by the signed
// lists of the Ubuntu release the workflows pin (`ubuntu-release`), so the
// runner and that release are named here together. `ubuntu-latest` would turn
// every install job red on the day GitHub moves it. A step that passes
// `ubuntu-release` must pass RELEASE.
//
//   node scripts/check-job-limits.js

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const GITHUB = join(ROOT, '.github');
const WORKFLOWS = join(GITHUB, 'workflows');
/** Minutes. The slowest job is measured at about 10.5; its limit is 25. */
const CEILING = 30;
/** The one runner image every job runs on, and the Ubuntu release it is. */
const RUNNER = 'ubuntu-24.04';
const RELEASE = 'noble';

const isMapping = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const yamlFiles = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? yamlFiles(join(dir, e.name)) : /\.ya?ml$/i.test(e.name) ? [join(dir, e.name)] : []));

const failed = [];
let jobs = 0;
let workflows = 0;
for (const path of yamlFiles(GITHUB).sort()) {
  const name = relative(GITHUB, path);
  let doc;
  try {
    doc = yaml.load(readFileSync(path, 'utf8'), { filename: name });
  } catch (error) {
    failed.push(`${name}: not readable as YAML (${error.reason ?? error.message}), so its jobs cannot be checked`);
    continue;
  }
  // GitHub runs the workflows in .github/workflows itself, not in a folder below it.
  if (join(path, '..') !== WORKFLOWS) continue;
  workflows += 1;
  const found = isMapping(doc) && isMapping(doc.jobs) ? Object.entries(doc.jobs) : [];
  if (found.length === 0) {
    failed.push(`${name}: no jobs found in it`);
    continue;
  }
  for (const [job, body] of found) {
    jobs += 1;
    const minutes = isMapping(body) ? body['timeout-minutes'] : undefined;
    if (minutes === undefined || minutes === null) failed.push(`${name}: job "${job}" has no timeout-minutes`);
    else if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) failed.push(`${name}: job "${job}" has timeout-minutes ${JSON.stringify(minutes)}, not a number of minutes`);
    else if (minutes > CEILING) failed.push(`${name}: job "${job}" may run ${minutes} minutes, over the ${CEILING}-minute ceiling`);
    const runsOn = isMapping(body) ? body['runs-on'] : undefined;
    if (runsOn !== RUNNER) failed.push(`${name}: job "${job}" runs on ${runsOn === undefined ? 'nothing named' : JSON.stringify(runsOn)}, not "${RUNNER}"`);
    for (const step of (isMapping(body) && Array.isArray(body.steps) ? body.steps : [])) {
      const release = isMapping(step) && isMapping(step.with) ? step.with['ubuntu-release'] : undefined;
      if (release !== undefined && release !== RELEASE) failed.push(`${name}: job "${job}" pins Ubuntu ${JSON.stringify(release)}, not "${RELEASE}", the release of ${RUNNER}`);
    }
  }
}
for (const m of failed) console.log(`  FAIL ${m}`);
if (failed.length || jobs === 0) {
  console.error(`\njob limits — ${failed.length} failed, of ${jobs} jobs in ${workflows} workflows.`);
  process.exit(1);
}
console.log(`job limits — all ${jobs} jobs in ${workflows} workflows have timeout-minutes, none over ${CEILING}, and run on ${RUNNER} (${RELEASE}); every YAML file under .github reads.`);
