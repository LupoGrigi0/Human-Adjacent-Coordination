#!/usr/bin/env node
// test_room_history.mjs — COULD NOT LOOK must never read as FOUND NOTHING.
//
// The defect, measured by Forge-ba0e and escalated by Cairn-2001 as a BLOCKER
// rather than filed as a note:
//
//     messaging-simple.js  try { history = await ejabberdctl(...) } catch { history = '' }
//
// A hub-side room-history failure came back as {success:true, messages:[]} —
// indistinguishable from an empty inbox. THREE independent pollers (Cairn's,
// Lodestone's, Forge's) depend on that call, and none can work around it from the
// client side. Cairn's framing: a doorbell whose quiet cannot be distinguished
// from a hub failure is a canary that silently stops testing and reports HEARING
// forever.
//
// ONE helper, not three patches. The three sites had the IDENTICAL swallow, and
// patching one would have manufactured the divergence this codebase keeps
// producing: "two implementations that agree on every input you have are one
// implementation's worth of evidence and two implementations' worth of risk"
// (Cairn-2001).
//
// THE BLAST-RADIUS LESSON IS APPLIED, because I got it wrong once and it cost the
// fleet five hours: making a swallowed condition loud took the entire bus down on
// 2026-10-03, because the swallowed condition was the MOST COMMON one. So "room
// does not exist" is BENIGN here — a mind with no room has genuinely received no
// mail, and a brand-new instance must still get a clean empty inbox. Only an
// unclassifiable failure is loud.
//
// AND THE FIXTURES ARE THE REAL SHAPES, not my assumptions about them. That is the
// precise error that caused the outage: the rig synthesised an Error carrying the
// text in .message, while Node's exec puts stderr in .message and stdout ONLY in
// .stdout. A fixture is a claim about production. These are measured.
//                                                          -- Messenger-aa2a

let fail = 0, ctlFail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fail++; };
const control = (n, c) => {
  console.log((c ? 'CTRL-OK  ' : 'CTRL-BAD ') + n);
  if (!c) { ctlFail++; fail++; }
};

// Classify exactly as readRoomHistory does, over every stream. Kept in step with
// the implementation by the structural assertions at the bottom.
const classify = ({ stdout, error }) => {
  const text = [error?.message, error?.stdout, error?.stderr, stdout]
    .filter(Boolean).map(String).join('\n');
  if (/does not exist/i.test(text)) return 'no-room';     // benign: no mail
  if (error || /\{error,/.test(text)) return 'could-not-look';
  return 'read';
};

// CONTROLS — each verdict must be reachable, or an assertion that something is
// 'could-not-look' proves nothing (a stub returning it always would pass every
// defect check below).
control("can return 'read' for a clean history",
  classify({ stdout: '2026-10-06T00:00:00Z\t<message/>' }) === 'read');
control("can return 'no-room' for the benign case",
  classify({ stdout: '{error,"The room does not exist."}' }) === 'no-room');
control("can return 'could-not-look' at all",
  classify({ stdout: '{error,"Invalid vhost"}' }) === 'could-not-look');

check('clean history -> read',
  classify({ stdout: '' }) === 'read' && classify({ stdout: 'rows' }) === 'read');

// The benign branch, and the one that protects a brand-new instance from an error
// where it should see an empty inbox. Both streams, because rc varies.
check('room does not exist -> no-room (BENIGN: a new mind gets an empty inbox)',
  classify({ stdout: '{error,"The room does not exist."}' }) === 'no-room'
  && classify({ error: Object.assign(new Error('Command failed: ...'),
       { stdout: '{error,"The room does not exist."}', stderr: '' }) }) === 'no-room');

// REAL exec shape — the one the 2026-10-03 outage was made of. stdout is NOT in
// .message; a classifier reading .message alone is blind to it.
check('REAL exec shape: failure text on .stdout with rc!=0 -> could-not-look',
  classify({ error: Object.assign(new Error('Command failed: docker exec ejabberd ejabberdctl get_room_history "personality-x" "conference.smoothcurves.nexus"\n'),
    { stdout: '{error,"Invalid vhost"}', stderr: '', code: 1 }) }) === 'could-not-look');

check('REAL exec shape: infrastructure failure on .stderr -> could-not-look',
  classify({ error: Object.assign(new Error('Command failed: ...\npermission denied while trying to connect to the Docker daemon socket'),
    { stdout: '', stderr: 'permission denied while trying to connect to the Docker daemon socket', code: 126 }) }) === 'could-not-look');

check('an unknown thrown failure -> could-not-look, NEVER read-as-empty',
  classify({ error: new Error('ETIMEDOUT') }) === 'could-not-look'
  && classify({ error: new Error('something nobody has seen') }) === 'could-not-look');

// Structural: ONE helper, and all three former swallow sites now surface it.
const fs = await import('fs');
const msg = fs.readFileSync(new URL('../src/v2/messaging.js', import.meta.url), 'utf8');
const simple = fs.readFileSync(new URL('../src/v2/messaging-simple.js', import.meta.url), 'utf8');

check('readRoomHistory exists as ONE shared helper',
  /export async function readRoomHistory\(/.test(msg));
check('the catch-to-empty swallow is gone from every site',
  !/catch \{\s*history = '';\s*\}/.test(simple));
// v1 asserted EXACTLY 3 occurrences. The absent-room guard added a second
// could-not-look return per caller, so the count went to 6 and the test went red
// on strictly better code. THIRD time one of my assertions has pinned a COUNT
// where it meant a PROPERTY (Cairn: asserting syntax where you should assert the
// property). Re-pinned: at least one per caller, and the swallow still gone.
check('every caller surfaces could-not-look distinctly (>= one per caller)',
  (simple.match(/reason: 'history_unavailable'/g) || []).length >= 3);
check('the helper inspects stdout AND stderr, not just .message',
  /err\?\.stdout/.test(msg) && /err\?\.stderr/.test(msg));

// ===========================================================================
// 2026-11-25 — THE BENIGN BRANCH REINTRODUCED THE DISEASE AT A NARROWER APERTURE.
// "Room does not exist" was classified benign to protect a brand-new mind from an
// error where it should see an empty inbox. For an ESTABLISHED mind it is a
// failure — and it bit me: do_i_have_new_messages returned total_unread:0 while
// twenty messages sat unread in that room, and I reported "no new messages" on
// the strength of it. Twenty minutes later the same call returned 20. The room was
// transiently absent during the v2/Ferry rollout, and the benign branch rendered
// that as "you have no mail", success:true.
//
// The discriminator is a DENOMINATOR, as every time: a register that does not come
// from the thing being measured. read_messages.json is written on the READ path and
// is independent of the room. Ever read a message => that room existed => its
// absence now is a failure.
// ===========================================================================
const simpleSrc = fs.readFileSync(new URL('../src/v2/messaging-simple.js', import.meta.url), 'utf8');

control('rig can see the absent-room guard at all', /absentRoomIsBenign/.test(simpleSrc));

check('an absent room is judged by the CALLER, which has the instance context',
  /async function absentRoomIsBenign\(instanceId\)/.test(simpleSrc));

check('the discriminator is read_messages.json — independent of the room',
  /const readSet = await getReadMessages\(instanceId\);\s*\n\s*return readSet\.size === 0;/.test(simpleSrc));

check('it errs toward LOUD: cannot-tell means NOT benign',
  /catch \{\s*\n\s*return false;/.test(simpleSrc));

check('all THREE callers apply the guard, not one',
  (simpleSrc.match(/hist\.existed === false && !\(await absentRoomIsBenign\(instanceId\)\)/g) || []).length === 3);

check('an established mind gets success:FALSE, never zero-unread, on an absent room',
  /is absent, but this instance has read mail before/.test(simpleSrc)
  && /reason: 'history_unavailable'/.test(simpleSrc));

if (ctlFail) {
  console.log(`\n${ctlFail} CONTROL(S) FAILED — the rig is broken, not the code.`);
  process.exit(2);
}
console.log(fail
  ? `\n${fail} FAILED — a hub failure can still read as "no mail".`
  : '\nOK — could-not-look is distinguishable from found-nothing, and no-room stays benign.');
process.exit(fail ? 1 : 0);
