#!/usr/bin/env node
/**
 * make-translation-slices.mjs — one-off helper: splits the English detail into slices for
 * parallel translation, then merges the translated slices into scripts/vi-details.json.
 *
 *   node scripts/make-translation-slices.mjs split   -> scripts/.cache/translate/slice-N.json
 *   node scripts/make-translation-slices.mjs merge   -> scripts/vi-details.json
 *
 * Only fields that need human-language translation are sliced out. Command lines are included
 * ONLY when they carry quoted prose a reader has to understand; a bare `/ck:ship beta` is left
 * alone. Slices are balanced by character count, not item count, so no translator gets a slice
 * that is mostly long overviews.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DETAILS = path.join(ROOT, 'data', 'details.js');
const SLICE_DIR = path.join(ROOT, 'scripts', '.cache', 'translate');
const DONE_DIR = path.join(ROOT, 'scripts', '.cache', 'translated');
const OUT = path.join(ROOT, 'scripts', 'vi-details.json');
const SLICES = 8;

function loadDetails() {
  const src = fs.readFileSync(DETAILS, 'utf8');
  return JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('};') + 1));
}

/** A command line needs translating only if it contains quoted prose. */
function commandNeedsWork(line) {
  return /["'][^"']{8,}["']/.test(line);
}

function split() {
  const details = loadDetails();
  const jobs = [];

  for (const [id, d] of Object.entries(details)) {
    const job = { id };
    if (d.overview) job.overview = d.overview;
    if (d.whenToUse) job.whenToUse = d.whenToUse;
    if (d.flags.length) job.flags = Object.fromEntries(d.flags.map((f) => [f.flag, f.desc]));

    // Prose scenarios always; command lines only when they carry quoted prose.
    const examples = d.examples.filter((e) => !e.startsWith('/') || commandNeedsWork(e));
    if (examples.length) job.examples = examples;

    if (Object.keys(job).length > 1) jobs.push(job);
  }

  const weight = (j) => JSON.stringify(j).length;
  jobs.sort((a, b) => weight(b) - weight(a)); // heaviest first, so greedy packing stays balanced

  const buckets = Array.from({ length: SLICES }, () => ({ chars: 0, jobs: [] }));
  for (const job of jobs) {
    const lightest = buckets.reduce((a, b) => (a.chars <= b.chars ? a : b));
    lightest.jobs.push(job);
    lightest.chars += weight(job);
  }

  fs.rmSync(SLICE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SLICE_DIR, { recursive: true });
  buckets.forEach((b, i) => {
    const n = String(i + 1).padStart(2, '0');
    b.jobs.sort((a, z) => a.id.localeCompare(z.id));
    fs.writeFileSync(path.join(SLICE_DIR, `slice-${n}.json`), JSON.stringify(b.jobs, null, 2), 'utf8');
    console.log(`slice-${n}.json — ${b.jobs.length} items, ${b.chars.toLocaleString()} chars`);
  });
  console.log(`\ntotal: ${jobs.length} items -> ${SLICES} slices in ${path.relative(ROOT, SLICE_DIR)}`);
}

function merge() {
  const details = loadDetails();
  const files = fs.readdirSync(DONE_DIR).filter((f) => f.endsWith('.json')).sort();
  if (!files.length) throw new Error(`no translated slices in ${DONE_DIR}`);

  const vi = {};
  for (const f of files) {
    const rows = JSON.parse(fs.readFileSync(path.join(DONE_DIR, f), 'utf8'));
    for (const row of rows) {
      if (!row.id) throw new Error(`${f}: row without id`);
      if (!details[row.id]) throw new Error(`${f}: unknown id ${row.id}`);
      if (vi[row.id]) throw new Error(`duplicate id across slices: ${row.id}`);
      const { id, ...rest } = row;
      vi[id] = rest;
    }
  }

  const ordered = {};
  for (const id of Object.keys(vi).sort()) ordered[id] = vi[id];
  fs.writeFileSync(OUT, JSON.stringify(ordered, null, 2) + '\n', 'utf8');
  console.log(`merged ${files.length} slices -> ${path.relative(ROOT, OUT)} (${Object.keys(ordered).length} items)`);
}

const cmd = process.argv[2];
if (cmd === 'split') split();
else if (cmd === 'merge') merge();
else {
  console.error('usage: node scripts/make-translation-slices.mjs <split|merge>');
  process.exit(1);
}
