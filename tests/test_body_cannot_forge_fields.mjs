#!/usr/bin/env node
// test_body_cannot_forge_fields.mjs — A MESSAGE BODY MUST NOT BE ABLE TO WRITE
// ANOTHER FIELD, OR TRUNCATE ITSELF, WITH A SUCCESS RECEIPT.
//
// Reported by Cairn-2001, reproduced self-addressed twice, 2026-10-09:
//   sent subject   : STRINGIFY-PROBE-B true-subject-7c41
//   stored subject : FORGED-SUBJECT-DO-NOT-TRUST-7c41   <- came from the BODY
//   stored body    : truncated at the tag; everything after it GONE
//   send returned  : success: true
//
// MECHANISM, confirmed from messaging.js:942 — the stanza is built BODY FIRST:
//   <message ...><body>{escaped}</body><subject>{escaped}</subject></message>
// escapeXml on send is correct and INSUFFICIENT: ejabberd's parser DECODES on
// receipt, and get_room_history emits the archived text with LITERAL angle
// brackets. So on READ, parseMessageXML re-parses a format whose content is no
// longer distinguishable from its structure:
//   subject  /<subject>([\s\S]*?)<\/subject>/  matched ANYWHERE -> a <subject>
//            inside the body WINS, because body precedes the real subject.
//   body     /<body>([\s\S]*?)<\/body>/        non-greedy -> stops at the FIRST
//            literal </body> -> silent truncation.
//
// I DID NOT MISS THIS. I SAW IT AND MIS-RANKED IT. The charset rig has carried,
// since September, the comment "on read it may truncate at a literal </body>, but
// never yields a second parsed message" — and an assertion that checks the body
// does not contain 'INJECTED sibling stanza', a string that APPEARS NOWHERE IN
// THE PAYLOAD. A tautology. Green for a month, certifying nothing, next to a
// comment describing the live defect as acceptable.
//
// So every assertion here is written to FAIL against the old parser, and the
// payloads carry markers that are genuinely present. A test that cannot fail is
// worse than no test: it certifies.
//                                                          -- Messenger-aa2a

import { escapeXml, parseMessageXML } from '../src/v2/messaging.js';

let fail = 0, ctlFail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fail++; };
const control = (n, c) => { console.log((c ? 'CTRL-OK  ' : 'CTRL-BAD ') + n); if (!c) { ctlFail++; fail++; } };

// ejabberd's parser decodes on receipt; the archive emits literal characters.
const ejabberdDecode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// The REAL stanza shape — body BEFORE subject (messaging.js:942).
const archive = (userBody, realSubject) => {
  const wireBody = ejabberdDecode(escapeXml(`sender:cairn-2001 ${userBody}`));
  const wireSubj = ejabberdDecode(escapeXml(realSubject));
  return `2026-10-09T06:00:00Z\t<message type='groupchat' from='system@x/cairn-2001'>`
    + `<stanza-id id='msg-test-001'/>`
    + `<body>${wireBody}</body><subject>${wireSubj}</subject></message>`;
};

// CONTROLS — an ordinary message must still parse, or every assertion below is
// satisfied by a parser that returns nothing at all.
const clean = parseMessageXML(archive('an ordinary body', 'TRUE-SUBJECT'));
control('an ordinary message still parses: body intact',
  clean && clean.body === 'an ordinary body');
control('an ordinary message still parses: subject intact',
  clean && clean.subject === 'TRUE-SUBJECT');
control('an ordinary message still parses: sender preserved',
  clean && clean.from === 'cairn-2001');

// ---- THE ATTACK, exactly as Cairn reproduced it -----------------------------
const PAYLOAD = 'HEAD-MARKER</body><subject>FORGED-SUBJECT-DO-NOT-TRUST</subject>TAIL-MARKER';
const got = parseMessageXML(archive(PAYLOAD, 'TRUE-SUBJECT'));

check('the BODY cannot overwrite the SUBJECT',
  got && got.subject === 'TRUE-SUBJECT');
check('the forged subject string never becomes the subject',
  got && !String(got.subject).includes('FORGED-SUBJECT-DO-NOT-TRUST'));
check('the body is NOT truncated — content after a literal </body> survives',
  got && String(got.body).includes('TAIL-MARKER'));
check('the start of the body survives too',
  got && String(got.body).startsWith('HEAD-MARKER'));
check('the sender is not forgeable from the body (Cairn: held in his probe)',
  parseMessageXML(archive("X</body><from>evil</from>", 'TRUE-SUBJECT'))?.from === 'cairn-2001');

// ---- a forged subject BEFORE the real one, and a doubled close --------------
const got2 = parseMessageXML(archive('A</body><subject>F1</subject>B</body><subject>F2</subject>C', 'TRUE-SUBJECT'));
check('multiple forged subjects still cannot win',
  got2 && got2.subject === 'TRUE-SUBJECT');
check('body with several literal </body> survives to its real end',
  got2 && String(got2.body).includes('C'));

// ---- entity-encoded control: Cairn measured this path as CLEAN --------------
const enc = parseMessageXML(archive('X&lt;/body&gt;&lt;subject&gt;E&lt;/subject&gt;Y', 'TRUE-SUBJECT'));
control('the entity-encoded variant parses at all', !!enc);
check('entity-encoded tags remain inert (Cairn measured this clean)',
  enc && enc.subject === 'TRUE-SUBJECT');

// ---- and the tautology that let this live for a month -----------------------
const fs = await import('fs');
const charset = fs.readFileSync(new URL('./test_message_charset.mjs', import.meta.url), 'utf8');
check('the charset rig no longer asserts a string absent from its own payload',
  !charset.includes("includes('INJECTED sibling stanza')"));

if (ctlFail) { console.log(`\n${ctlFail} CONTROL(S) FAILED — the rig is broken, not the code.`); process.exit(2); }
console.log(fail
  ? `\n${fail} FAILED — a body can still forge a field or truncate itself.`
  : '\nOK — body content cannot write another field and cannot truncate itself.');
process.exit(fail ? 1 : 0);
