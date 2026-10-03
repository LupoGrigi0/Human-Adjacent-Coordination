#!/usr/bin/env node
// test_ensure_room.mjs — A SEND TO A DESTINATION THAT DOES NOT EXIST MUST NOT REPORT SUCCESS.
//
// Specimen, 2026-09-28: Forge-ba0e sent to dev-reconstruction-001-6f47. The hub
// returned success:true with a CORRECT delivered_to_id. The recipient could not list
// it; get_message hung 30s. Bastion-3012 then read ground truth:
//
//   get_room_history personality-dev -> {error,"The room does not exist."}
//
// The room had never existed. ensureRoom() caught EVERY error as "Room might already
// exist, that's fine" and returned a fabricated success, so sendMessage wrote a stanza
// into nothing and the hub reported delivery. accepted != delivered, at the hub.
//
// ONE FUNCTION PRODUCED BOTH HALVES OF THE SAME DISEASE:
//   * ejabberdctl logs EVERY failure at ERROR -> ~2,956 lines/24h, all of them the
//     benign {error,"Room already exists"} with rc=0. Bastion nearly dismissed the
//     real bug as part of that noise.
//   * ensureRoom swallows the FATAL failure in silence and reports success.
// An instrument screaming about the harmless case and mute about the fatal one.
// Both destroy the same thing: a row a reader can act on. (Bastion-3012)
//
// WHY THIS RIG TESTS A PURE CLASSIFIER RATHER THAN ensureRoom ITSELF:
// ensureRoom needs a docker socket, which I (uid 993) do not and should not have.
// So the DECISION is extracted into a pure function and tested exhaustively here,
// and the IO stays in ensureRoom. Testing what you can actually reach beats mocking
// what you cannot — and it means this rig runs anywhere, for anyone, forever.
//
// THE CASE THAT MATTERS MOST is rc=0 with an {error,...} on stdout: ejabberdctl
// reports some failures WITHOUT a non-zero exit, so "it did not throw" is not
// evidence of success. That is the same shape as a 404 that greps to 0.
//
// 2026-10-03 — THIS RIG FAILED TO PREVENT A TOTAL OUTAGE, AND HERE IS WHY.
// v1 synthesised `new Error('{error,"Room already exists"}')` — putting the
// ejabberd text in .message, which is where I ASSUMED it lived. It does not.
// Node's exec puts STDERR in .message and NOT STDOUT, and ejabberdctl reports
// "Room already exists" on STDOUT with a NON-ZERO exit. So the real error object
// carries the text in .stdout, .message says only "Command failed: <cmd>", the
// classifier read .message alone, EVERY create_room classified as 'failed',
// every send threw, and no instance could message any other. Axiom reported it
// BY EMAIL because the bus was the casualty.
//
// A test fixture is a CLAIM ABOUT PRODUCTION. Mine was a claim about my own
// assumption, and it passed, which is worse than having no test — it certified
// the bug. The error shapes below are now measured from a real failing exec,
// not imagined, and 'unknown' is pinned as NON-FATAL because collapsing
// "cannot tell" into a verdict is what caused the outage.
//                                                          — Messenger-aa2a

import fs from 'fs';

let fail = 0, ctlFail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fail++; };
const control = (n, c) => {
  console.log((c ? 'CTRL-OK  ' : 'CTRL-BAD ') + n);
  if (!c) { ctlFail++; fail++; }
};

let classify = null;
try { ({ classifyCreateRoom: classify } = await import('../src/v2/messaging.js')); } catch { /* absent */ }

if (typeof classify !== 'function') {
  check('classifyCreateRoom is exported from messaging.js', false);
  check('clean result  -> created', false);
  check('already-exists on stderr -> existed (benign)', false);
  check('already-exists on stdout, rc=0 -> existed (benign)', false);
  check('REAL exec shape: already-exists on .stdout with rc!=0 -> existed (the outage)', false);
  check('REAL exec shape: infrastructure failure, nothing classifiable -> unknown', false);
  check('explicit {error,...} anywhere -> failed (ejabberd told us)', false);
  check("UNKNOWN is a state of its own, never 'failed'", false);
  check("ensureRoom PROCEEDS on 'unknown' (loudly) instead of throwing", false);
  check('rc=0 WITH {error,...} on stdout -> failed (the fails-open case)', false);
  check('ensureRoom no longer swallows every error as "probably exists"', false);
} else {
  // CONTROLS — the classifier must be able to return each verdict at all, or an
  // assertion that it returns 'failed' proves nothing (a stub returning 'failed'
  // for everything would pass every defect check below).
  control("can return 'created' for a clean result",
    classify({ stdout: '' }) === 'created');
  control("can return 'existed' for the benign case",
    classify({ stdout: '{error,"Room already exists"}' }) === 'existed');
  control("can return 'failed' at all",
    classify({ stdout: '{error,"The room does not exist."}' }) === 'failed');
  control("can return 'unknown' at all",
    classify({ error: new Error('connection refused') }) === 'unknown');

  check('clean result  -> created',
    classify({ stdout: '' }) === 'created' && classify({ stdout: 'ok' }) === 'created');

  check('already-exists on stderr -> existed (benign)',
    classify({ error: new Error('{error,"Room already exists"}') }) === 'existed');

  check('already-exists on stdout, rc=0 -> existed (benign)',
    classify({ stdout: '{error,"Room already exists"}' }) === 'existed');

  // The whole point: an unknown failure must NEVER read as existed or created.
  // THE REAL SHAPE, measured from a live failing exec rather than imagined:
  // Node's exec Error carries stderr in .message, and stdout ONLY in .stdout.
  const realExistsError = Object.assign(
    new Error('Command failed: docker exec ejabberd ejabberdctl create_room "personality-x" "conference.smoothcurves.nexus" "smoothcurves.nexus"\n'),
    { stdout: '{error,"Room already exists"}', stderr: '', code: 1 });
  check('REAL exec shape: already-exists on .stdout with rc!=0 -> existed (the outage)',
    classify(realExistsError === undefined ? {} : { error: realExistsError }) === 'existed');

  const realStderrError = Object.assign(
    new Error('Command failed: docker exec ...\npermission denied while trying to connect to the Docker daemon socket'),
    { stdout: '', stderr: 'permission denied while trying to connect to the Docker daemon socket', code: 126 });
  check('REAL exec shape: infrastructure failure, nothing classifiable -> unknown',
    classify({ error: realStderrError }) === 'unknown');

  check('explicit {error,...} anywhere -> failed (ejabberd told us)',
    classify({ error: Object.assign(new Error('Command failed: ...'), { stdout: '{error,"Invalid vhost"}' }) }) === 'failed');

  // 'unknown' MUST NOT be fatal. This is the assertion whose absence caused the
  // outage: an unclassifiable failure took the entire bus down.
  check("UNKNOWN is a state of its own, never 'failed'",
    classify({ error: new Error('cannot connect to ejabberd') }) === 'unknown'
    && classify({ error: new Error('something nobody has seen before') }) === 'unknown');

  const src0 = fs.readFileSync(new URL('../src/v2/messaging.js', import.meta.url), 'utf8');
  check("ensureRoom PROCEEDS on 'unknown' (loudly) instead of throwing",
    /verdict === 'unknown'/.test(src0) && /unverified: true/.test(src0));

  // rc=0 is not success. ejabberdctl reports some failures on stdout with exit 0,
  // so "it did not throw" must not be read as "it worked".
  check('rc=0 WITH {error,...} on stdout -> failed (the fails-open case)',
    classify({ stdout: '{error,"The room does not exist."}' }) === 'failed'
    && classify({ stdout: '{error,"Invalid vhost"}' }) === 'failed');

  const src = fs.readFileSync(new URL('../src/v2/messaging.js', import.meta.url), 'utf8');
  check('ensureRoom no longer swallows every error as "probably exists"',
    !/Room might already exist, that's fine/.test(src));
}

if (ctlFail) {
  console.log(`\n${ctlFail} CONTROL(S) FAILED — the rig is broken, not the code.`);
  process.exit(2);
}
console.log(fail
  ? `\n${fail} FAILED — a send can still report success into a destination that does not exist.`
  : '\nOK — an unknown failure is never reported as success. rc=0 is not success.');
process.exit(fail ? 1 : 0);
