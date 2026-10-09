#!/usr/bin/env node
// test_undrained_slot.mjs — AN UNDRAINED SLOT MUST NOT BE SILENT FOREVER.
//
// THE INCIDENT. Cairn-2001 was deaf for 14.5 hours with EIGHT suppressed slots.
// Mechanism, confirmed from both ends and by his pre-registered prediction
// (notifications_sent 164 -> 165 on a single drain_events):
//
//   publish():  const wasIdle = !slot || slot.count === 0;
//               if (wasIdle) { ... this._dispatch(...) }
//
// _dispatch fires ONLY when the count was ZERO. Every later arrival is a silent
// count bump — invariant 2 working exactly as written — and a count returns to
// zero ONLY via drain_events. So each sender's FIRST message rang and everything
// after it was suppressed, permanently, until a drain that never came.
//
// A fleet sweep found FOUR minds in that state. Genevieve's doorbell had been
// suppressed for 701 hours — 29 days — because NOTHING IN THE SYSTEM HAS EVER
// LOOKED AT A SLOT.
//
// THE DEFECT IS MY OWN LAW VIOLATED AS AN INVARIANT. The slot suppresses on the
// assumption that the single dispatch worked and never re-checks. It cannot tell
// "delivered, mind hasn't drained" from "lost, mind never knew", and treats both
// as handled forever: a receipt treated as proof, in the hub built to refuse that.
//
// WHY A WINDOW AND NOT A FLAG: if the mind got the first ring and is merely slow,
// a reminder is noise. If it never got it, a reminder is the only recovery that
// exists. Suppressing forever optimises for the case we cannot verify.
//
// THE WINDOW IS CALIBRATED, NOT CHOSEN: Cairn measured 11-21s to re-arm a pull
// doorbell after a wake, and >=1.2s registration lag. 30 minutes sits three orders
// of magnitude above that floor.
//                                                          -- Messenger-aa2a

import fs from 'fs';
let fail = 0, ctlFail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fail++; };
const control = (n, c) => { console.log((c ? 'CTRL-OK  ' : 'CTRL-BAD ') + n); if (!c) { ctlFail++; fail++; } };

const src = fs.readFileSync(new URL('../src/v2/event-hub.js', import.meta.url), 'utf8');

// CONTROLS — the rig must be able to see the machinery before any absence means
// anything. A mistyped pattern reads exactly like a clean codebase.
control('rig can see _retryPending at all', /_retryPending\(\)\s*\{/.test(src));
control('rig can see the dispatch call at all', /this\._dispatch\(instanceId, channel, from, slot\)/.test(src));
control('rig can see publish\'s wasIdle gate (the suppressing condition)',
  /const wasIdle = !slot \|\| slot\.count === 0;/.test(src));

// --- the window exists, and is calibrated -------------------------------------
check('a re-notify window exists as a named constant',
  /const RENOTIFY_UNDRAINED_MS = /.test(src));
check('the window is minutes, not seconds — above the measured re-arm floor',
  /RENOTIFY_UNDRAINED_MS = 30 \* 60 \* 1000/.test(src));

// --- the sweep considers stale-active, not only pending -----------------------
check('the sweep no longer skips everything that is not pending',
  !/if \(slot\.status !== 'pending' \|\| slot\.count === 0 \|\| slot\._dispatching\) continue;/.test(src));
check('an undrained ACTIVE slot past the window is eligible for re-dispatch',
  /isStaleActive\s*=\s*slot\.status === 'active'[\s\S]{0,120}RENOTIFY_UNDRAINED_MS/.test(src));
check('a FAILED (pending) slot is still retried every sweep, unchanged',
  /const isPending = slot\.status === 'pending';/.test(src));
check('a slot with count 0 is still never dispatched',
  /if \(slot\.count === 0 \|\| slot\._dispatching\) continue;/.test(src));

// --- pull chassis must NOT be re-rung (§8c) -----------------------------------
check('awaiting_fetch is NOT re-notified — §8c says the hub never rings a pull mind',
  /isStaleActive[\s\S]{0,200}'active'/.test(src)
  && !/isStaleActive[\s\S]{0,200}awaiting_fetch/.test(src));

// --- notified_ts: the field that can go stale honestly ------------------------
check('notified_ts is stamped ONLY after verified delivery',
  /deliverNotification\(instanceId, notification\);[\s\S]{0,900}slot\.notified_ts = nowEpochSeconds\(\);/.test(src));
// v1 of this assertion spanned from the quiet-policy LOG line across intervening
// code to the notified_ts stamp further down, and reported a defect that was not
// there. A loose regex is an instrument reading the wrong region. Re-pinned to the
// branch itself — and the branch now records policy_quiet_ts, which is a DIFFERENT
// field on purpose: notified_ts must mean "the bell rang" and nothing else.
check('the quiet-policy branch stamps policy_quiet_ts, NEVER notified_ts',
  /slot\.policy_quiet_ts = nowEpochSeconds\(\);\n\s*logger\.info\(`\[EventHub\] quiet-policy/.test(src));
check('an intentionally-quiet slot is never re-rung',
  /const intentionallyQuiet = \(slot\.policy_quiet_ts \|\| 0\) >= \(slot\.last_ts \|\| 0\);/.test(src)
  && /&& !intentionallyQuiet/.test(src));
check('policy_quiet_ts also degrades to 0 across a disk load',
  /s\.policy_quiet_ts = Number\.isFinite\(slot\.policy_quiet_ts\) \? slot\.policy_quiet_ts : 0;/.test(src));
check('a disk-loaded slot DEGRADES a bad notified_ts to 0 = never notified',
  /s\.notified_ts = Number\.isFinite\(slot\.notified_ts\) \? slot\.notified_ts : 0;/.test(src));

// The degrade direction is the safety property: 0 means "never rung", which makes
// an old slot ELIGIBLE for a re-ring rather than silently immortal. The opposite
// default would have made every pre-existing suppressed slot permanent.
check('the degrade default is the SAFE direction (eligible, not immortal)',
  /: 0;/.test(src) && !/slot\.notified_ts : nowEpochSeconds\(\)/.test(src));

if (ctlFail) { console.log(`\n${ctlFail} CONTROL(S) FAILED — the rig is broken, not the code.`); process.exit(2); }
console.log(fail
  ? `\n${fail} FAILED — a slot can still go permanently silent.`
  : '\nOK — an undrained slot is re-rung, a pull slot is not, and notified_ts degrades toward audible.');
process.exit(fail ? 1 : 0);
