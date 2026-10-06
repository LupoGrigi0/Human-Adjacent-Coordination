#!/usr/bin/env node
// test_count_fields.mjs — A COUNT MUST NEVER BE INFERRED FROM AN ABSENCE OR A LIST LENGTH.
//
// `total_unread` used to appear ONLY when the page was truncated, so its ABSENCE
// carried the meaning "nothing was truncated". The first consumer to depend on it
// (Cairn-2001's doorbell poller) read absence as COULD NOT LOOK and alarmed on
// every ordinary inbox that fits in one page. He read the field name and believed
// it, which is the correct thing to do with an API.
//
// An optional field whose ABSENCE is meaningful is a field that will be misread.
// A boundary must say its own name — same principle as the truncation
// continuation handle and the `unmarked` discharge handle.
//
// AND A SECOND ERROR, MINE, CAUGHT BY HIS MEASUREMENT AND NOT BY MY READING:
// I told him the value was `displayMessages.length` meaning a PAGE length. It is
// the whole unread set. `displayMessages` is every body-bearing unread message;
// the page is `slice`. I quoted the line without reading the three lines above
// that define the variable, and INFERRED THE SEMANTICS FROM ITS NAME. He measured
// the live hub — limit=1 returned total_unread=10, not 1 — and flagged the hazard
// before I "fixed" the field into a page count, which would have silently broken
// every rising-total guard built on it.
//
// So this rig pins BOTH properties: always present, AND the real total.
// The page length and the total must be allowed to differ, or the assertion that
// they are the real total proves nothing.
//                                                          -- Messenger-aa2a

import fs from 'fs';
let fail = 0, ctlFail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fail++; };
const control = (n, c) => { console.log((c ? 'CTRL-OK  ' : 'CTRL-BAD ') + n); if (!c) { ctlFail++; fail++; } };

const src = fs.readFileSync(new URL('../src/v2/messaging-simple.js', import.meta.url), 'utf8');

// CONTROL — the rig can see the fields at all. Without this, every "is absent"
// assertion below would pass on a mistyped pattern, which is the 404-greps-to-0 shape.
control('rig can find total_unread in the source at all', /total_unread/.test(src));
control('rig can find the page-slice machinery at all', /slice\(0, cappedLimit\)/.test(src));

// --- always present -----------------------------------------------------------
check('total_unread is assigned UNCONDITIONALLY (not inside the truncation branch)',
  /result\.total_unread = displayMessages\.length;\s*\n\s*if \(displayMessages\.length > cappedLimit\)/.test(src));

check('the truncation branch now sets ONLY more_unread',
  !/if \(displayMessages\.length > cappedLimit\) \{\s*\n\s*result\.more_unread = true;\s*\n\s*result\.total_unread/.test(src));

check('do_i_have_new_messages reports total_unread in the ZERO case too',
  /new_messages: false, total_unread: 0/.test(src));

check('do_i_have_new_messages reports total_unread in the HAS-MAIL case',
  /total_unread: unread\.length/.test(src));

// --- the real total, not a page length ----------------------------------------
check('the value is the FULL unread set (displayMessages), never the page (slice/messages)',
  /result\.total_unread = displayMessages\.length/.test(src)
  && !/total_unread = (slice|messages)\.length/.test(src));

check('page and total come from DIFFERENT variables (so they can legitimately differ)',
  /const slice = displayMessages\.slice\(0, cappedLimit\)/.test(src));

// --- the silent cap -----------------------------------------------------------
check('the 5-id cap is a NAMED constant, not a bare literal',
  /const UNREAD_ID_CAP = 5/.test(src) && /slice\(0, UNREAD_ID_CAP\)/.test(src));

check('a clipped id list SAYS it was clipped (ids_truncated), never silently',
  /result\.ids_truncated = true/.test(src));

check('the clip hint names the real count so the list length is never the source',
  /total_unread is the real count/.test(src));

// --- the general property, stated as a test -----------------------------------
check('no count field is left assigned only inside a conditional branch',
  (src.match(/result\.total_unread = /g) || []).length >= 2
  && !/\n\s{6}result\.total_unread = displayMessages\.length;\n\s{4}\}/.test(src));

if (ctlFail) { console.log(`\n${ctlFail} CONTROL(S) FAILED — the rig is broken, not the code.`); process.exit(2); }
console.log(fail
  ? `\n${fail} FAILED — a caller can still be made to infer a count.`
  : '\nOK — counts are always present, always real, and a clipped list says so.');
process.exit(fail ? 1 : 0);
