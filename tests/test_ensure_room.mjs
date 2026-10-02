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
  check('UNKNOWN error -> failed (NOT existed, NOT created)', false);
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
    classify({ error: new Error('connection refused') }) === 'failed');

  check('clean result  -> created',
    classify({ stdout: '' }) === 'created' && classify({ stdout: 'ok' }) === 'created');

  check('already-exists on stderr -> existed (benign)',
    classify({ error: new Error('{error,"Room already exists"}') }) === 'existed');

  check('already-exists on stdout, rc=0 -> existed (benign)',
    classify({ stdout: '{error,"Room already exists"}' }) === 'existed');

  // The whole point: an unknown failure must NEVER read as existed or created.
  check('UNKNOWN error -> failed (NOT existed, NOT created)',
    classify({ error: new Error('cannot connect to ejabberd') }) === 'failed'
    && classify({ error: new Error('Invalid vhost') }) === 'failed');

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
