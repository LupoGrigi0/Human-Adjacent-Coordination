#!/usr/bin/env node
// Regression test: files in instances/ (e.g. .gitignore) must not crash
// directory scans with ENOTDIR.
//
// Bug: lookupIdentity() scanned instances/ with a bare readdir, treated the
// .gitignore file (added 2026-08-06, PII hardening) as an instance dir, and
// fs.readFile('.gitignore/preferences.json') threw ENOTDIR — which neither
// readJSON() nor the caller caught. lookup_identity is the first call a
// freshly-woken amnesiac instance makes to find itself, so it crashed at the
// exact moment recovery exists for.
//
// Fix under test:
//   1. data.js readJSON() treats ENOTDIR like ENOENT (returns null)
//   2. data.js listSubdirectories() + directory-only scans in identity.js,
//      joinProject.js, messaging-simple.js, instances.js
//
// Run: node tests/test_identity_dotfile_scan.mjs
// (Found by Axiom-9314; fixed by Crossing-2d23, 2026-08-10)

import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';

// --- Build a throwaway data root BEFORE importing config.js (it reads the
// env var at module load).
const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'hacs-identity-test-'));
process.env.V2_DATA_ROOT = fixtureRoot;

const instancesDir = path.join(fixtureRoot, 'instances');
await mkdir(instancesDir, { recursive: true });

// The trap: a plain FILE sitting in instances/ (this is what crashed prod)
await writeFile(path.join(instancesDir, '.gitignore'), 'preferences.json\n');
// A second trap: a non-dot regular file
await writeFile(path.join(instancesDir, 'README.txt'), 'not an instance\n');

// Two real instance dirs
for (const [id, name] of [['TestAlpha-1111', 'TestAlpha'], ['TestBeta-2222', 'TestBeta']]) {
  const dir = path.join(instancesDir, id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'preferences.json'), JSON.stringify({
    instanceId: id,
    name,
    role: 'Tester',
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    context: { workingDirectory: `/home/${id}`, hostname: 'testhost' }
  }, null, 2));
}

const { lookupIdentity } = await import('../src/v2/identity.js');
const { readJSON, listSubdirectories } = await import('../src/v2/data.js');

let failures = 0;
function check(label, cond, detail = '') {
  if (cond) { console.log(`  PASS  ${label}`); }
  else { failures++; console.log(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`); }
}

console.log('test_identity_dotfile_scan');

// 1. The crash repro: scan must survive files in instances/
let result, threw = null;
try {
  result = await lookupIdentity({ name: 'TestAlpha' });
} catch (e) {
  threw = e;
}
check('lookupIdentity does not throw with .gitignore present',
  threw === null, threw && `${threw.code || ''} ${threw.message}`);

// 2. And still finds the real instance (single-match shape: {instanceId} at top level)
check('lookupIdentity finds TestAlpha',
  result?.success === true && result?.instanceId === 'TestAlpha-1111',
  String(JSON.stringify(result ?? null)).slice(0, 200));

// 3. readJSON treats a file-in-the-path as "no such JSON", not a crash
const viaFile = await readJSON(path.join(instancesDir, '.gitignore', 'preferences.json'));
check('readJSON returns null on ENOTDIR path', viaFile === null);

// 4. listSubdirectories filters files out
const subdirs = await listSubdirectories(instancesDir);
check('listSubdirectories returns only the 2 instance dirs',
  subdirs.length === 2 && subdirs.includes('TestAlpha-1111') && subdirs.includes('TestBeta-2222'),
  JSON.stringify(subdirs));

await rm(fixtureRoot, { recursive: true, force: true });

if (failures) {
  console.log(`\n${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('\nall green');
