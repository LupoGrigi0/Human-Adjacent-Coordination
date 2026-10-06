#!/usr/bin/env node
// test_read_state.mjs — READ-STATE MUST BE WRITTEN BY THE PATH THAT ACTUALLY READS.
//
// Found 2026-09-28 while answering Lodestone-8ec9's RFC-0001 question about whether
// "still unread" is derivable on the hub. It is not, and the reason is mine:
//
//   list_my_messages -> get_message    marks read   (legacy path)
//   drain_events     -> read_message   marks NOTHING (the doorbell path — the modern one)
//
// So a chassis mind using the doorbell leaves every letter permanently unread. This is
// the fifth sighting of one concept implemented N times and agreeing by luck: the input
// that changed was the doorbell existing at all. I built read_message and did not carry
// the read-state obligation across.
//
// Per channel, at the time of writing:
//   hacs      read_messages.json   honoured ONLY by the legacy path
//   email     maildir new/->cur/ + the :2,S Seen flag — a 1995 standard we store and ignore
//   telegram  no read-state mechanism at all
//
// THE CONTROL DISCIPLINE THIS RIG INSISTS ON:
// Every "the defect is present" assertion is PAIRED with a control proving the rig could
// have observed the opposite. A structural test that asserts absence is worthless alone —
// a typo in the pattern reads exactly like a clean codebase, which is the same shape as
// a 404 that greps to 0 (Cairn) and a git log that returns empty on an unfetched repo.
// If a CONTROL fails, do not read the defect lines: the instrument is broken, not the code.
//
// WHAT THIS RIG ASSERTS, AND A CORRECTION TO ITS OWN FIRST DRAFT:
// v1 of this file asserted that read_message should record the read. That is the NAIVE
// fix and it is wrong — it is implicit marking, which the design deliberately rejects
// (a truncated window silently marked read is data loss). v1 would have driven the
// implementation to build exactly the thing we argued against, and then reported it
// validated. An instrument answering the question ADJACENT to the one intended, written
// by the person who had just argued the point. Caught before implementing against it.
// v2 asserts the AGREED design: read_message stays inert but must SURFACE the obligation;
// mark_read carries the claim. CONTROL 3 now pins the correct behaviour so no future
// "fix" reintroduces inference.
//
// EXPECTED TO REPORT THE DEFECT until mark_read lands. This is the failing test written
// first; Lodestone's RFC-0001 test 3 cites it as precondition.  — Messenger-aa2a

import fs from 'fs';
import path from 'path';
import os from 'os';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'readstate-'));
process.env.V2_DATA_ROOT = ROOT + path.sep;   // MUST be set before importing config

const INST = 'readstate-test';
const instDir = path.join(ROOT, 'instances', INST);
fs.mkdirSync(path.join(instDir, 'hacs'), { recursive: true });
fs.mkdirSync(path.join(instDir, 'mail', 'new'), { recursive: true });
fs.mkdirSync(path.join(instDir, 'mail', 'cur'), { recursive: true });

// --- hacs body store: one letter, unread ------------------------------------
const HACS_REF = 'msg-readstate-0001';
fs.writeFileSync(path.join(instDir, 'hacs', 'inbox.jsonl'),
  JSON.stringify({ ref: HACS_REF, from: 'lodestone-8ec9', ts: 1790563000,
                   subject: 'custody is a property of the bus',
                   text: 'the spoke never holds the letter, only the doorbell' }) + '\n');

// --- maildir: one letter in new/, no Seen flag (maildir says unread) --------
const MAIL_NAME = '1790563000.M1P1.smoothcurves:2,';
const mailNew = path.join(instDir, 'mail', 'new', MAIL_NAME);
fs.writeFileSync(mailNew,
  'From: forge-ba0e@smoothcurves.nexus\r\n' +
  'To: messenger-aa2a@smoothcurves.nexus\r\n' +
  'Subject: the juniper\r\n' +
  'Date: Sat, 27 Sep 2026 06:00:00 +0000\r\n' +
  'Message-ID: <juniper@smoothcurves.nexus>\r\n' +
  'Content-Type: text/plain; charset=utf-8\r\n\r\n' +
  'black lace, gold pouring through the gaps\r\n');

let fail = 0, ctlFail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fail++; };
const control = (n, c) => {
  console.log((c ? 'CTRL-OK  ' : 'CTRL-BAD ') + n);
  if (!c) { ctlFail++; fail++; }
};

const { readMessage } = await import('../src/v2/read-message.js');

// ===========================================================================
// CONTROL 1 — the rig can READ. If this fails, every absence below is meaningless.
// ===========================================================================
const hacsRes = await readMessage({ instanceId: INST, refs: [HACS_REF] });
control('rig can open a hacs ref at all (else absences prove nothing)',
  hacsRes?.success === true && hacsRes.messages?.[0]?.body?.includes('only the doorbell'));

const mailRes = await readMessage({ instanceId: INST, refs: [mailNew] });
control('rig can open a maildir ref at all (python MIME parse works here)',
  mailRes?.success === true && /gold pouring/.test(mailRes.messages?.[0]?.body || ''));

// ===========================================================================
// CONTROL 2 — read-state machinery EXISTS. Proves the asymmetry is real and not
// a mistyped pattern: the concept is implemented, just not on the modern path.
// ===========================================================================
const simpleSrc = fs.readFileSync(new URL('../src/v2/messaging-simple.js', import.meta.url), 'utf8');
control('legacy path DOES implement read-state (markAsRead + read_messages.json)',
  /function markAsRead\(/.test(simpleSrc) && /read_messages\.json/.test(simpleSrc));

// ===========================================================================
// CONTROL 3 — read_message must NOT mark read. This is CORRECT behaviour and
// must stay correct: read_message returns a 4000-char window with truncated:true,
// and silently marking a partially-read letter as read is its own data loss.
// The claim belongs to the mind (mark_read), never to the fetch.
// This control guards against "fixing" the defect by inferring the read.
// ===========================================================================
const readPath = path.join(instDir, 'read_messages.json');
const trackedAfterFetch = fs.existsSync(readPath);
control('read_message did NOT mark read (inferring the read is the WRONG fix)',
  trackedAfterFetch === false);
control('read_message still reports truncation honestly (the reason not to infer)',
  Object.prototype.hasOwnProperty.call(mailRes.messages?.[0] || {}, 'truncated'));

// ===========================================================================
// THE DEFECT 1 — read_message does not tell the mind what is OUTSTANDING.
// Never inferred, but never silent either: forgetting must be LOUD.
// ===========================================================================
check('read_message returns per-ref read_state so the obligation is visible',
  hacsRes.messages?.[0]?.read_state !== undefined);
check('read_message returns a handle to discharge the obligation',
  hacsRes.mark_read_refs !== undefined || hacsRes.unmarked !== undefined);

// ===========================================================================
// THE DEFECT 2 — mark_read does not exist. It is the verb that carries the claim.
// refs 1-50, dispatching by scheme, per-ref receipts a batch never fans out.
// ===========================================================================
let markRead = null;
try { ({ markRead } = await import('../src/v2/read-message.js')); } catch { /* absent */ }
check('mark_read verb exists and is exported', typeof markRead === 'function');

if (typeof markRead === 'function') {
  await markRead({ instanceId: INST, refs: [HACS_REF] });
  // read_messages.json is {read:[...]} — this rig guessed wrong TWICE about the
  // shape (bare array, then a map) and only running it against the real
  // implementation settled it. Accept any of the three so the assertion is about
  // read-state, not about a format I mis-remembered.
  let tracked = null;
  try { tracked = JSON.parse(fs.readFileSync(readPath, 'utf8')); } catch { /* none */ }
  const isTracked = (t, ref) => Array.isArray(t) ? t.includes(ref)
    : Array.isArray(t?.read) ? t.read.includes(ref)
    : !!t?.[ref];
  check('mark_read: hacs ref lands in read_messages.json', isTracked(tracked, HACS_REF));

  await markRead({ instanceId: INST, refs: [mailNew] });
  check('mark_read: email leaves new/ (maildir standard, unhonoured since 1995)',
    !fs.existsSync(mailNew));
  check('mark_read: email gains the :2,S Seen flag',
    fs.readdirSync(path.join(instDir, 'mail', 'cur')).some((f) => /:2,[A-Z]*S/.test(f)));
} else {
  check('mark_read: hacs ref lands in read_messages.json', false);
  check('mark_read: email leaves new/ (maildir standard, unhonoured since 1995)', false);
  check('mark_read: email gains the :2,S Seen flag', false);
}

// ===========================================================================
// THE DEFECT 3 — structural: the modern verb has no read-state vocabulary at all.
// ===========================================================================
const readSrc = fs.readFileSync(new URL('../src/v2/read-message.js', import.meta.url), 'utf8');
check('read-message.js has read-state vocabulary (mark_read / maildir flags)',
  /markRead|mark_read|read_messages\.json|:2,/.test(readSrc));

// ===========================================================================
// THE DESIGN THAT FIXES IT (RFC-0001 r4 §9, argued to shape with Lodestone):
//   mark_read({instanceId, refs:[1-50], receipt?:<per-ref>}) dispatching by scheme
//   read_message returns the outstanding obligation + the handle to discharge it
//   drain_events reports opened_unmarked: N   <- forgetting becomes LOUD, not silent
// Never inferred (a truncated read silently marked read is its own data loss);
// never merely remembered (a verb you must remember is a habit, and habits detect
// while mechanisms prevent — Lodestone's sentence, which his own first two drafts
// broke and which this rig exists to keep honest).
// ===========================================================================

fs.rmSync(ROOT, { recursive: true, force: true });

if (ctlFail) {
  console.log(`\n${ctlFail} CONTROL(S) FAILED — the rig is broken, not the code. Fix the rig first.`);
  process.exit(2);
}
console.log(fail
  ? `\n${fail} FAILED — read-state defect CONFIRMED and reproduced. Expected until mark_read lands.`
  : '\nOK — the path that reads also records that it read.');
process.exit(fail ? 1 : 0);
