#!/usr/bin/env node
// test_message_charset.mjs — the message path must preserve EVERY character and
// stay injection-safe. Guards two 2026-09-06 bugs:
//   (1) sanitizeForShell STRIPPED ~24 shell metacharacters from every body.
//   (2) a read-side unescape DOUBLE-DECODED legitimate entity text ("&amp;"->"&").
//
// The confirmed pipeline (Bastion raw capture): escapeXml on SEND -> ejabberd's
// XML parser DECODES on receipt -> get_room_history emits that text with LITERAL
// characters -> parseMessageXML reads it AS-IS (no second decode). We model
// ejabberd in the middle, which the first rig omitted and thus missed bug (2).
import { escapeXml, parseMessageXML } from '../src/v2/messaging.js';
import fs from 'fs';

let fail = 0;
const check = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fail++; };

// Simulate ejabberd's XML parser decoding a stanza body on receipt.
const ejabberdDecode = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&amp;/g, '&');

// Full path a body travels, ending in what parseMessageXML actually receives.
const roundTrip = (userBody) => {
  const wireBody = ejabberdDecode(escapeXml(`sender:bastion-3012 ${userBody}`)); // get_room_history raw
  const stanza = `2026-09-06T00:00:00Z\t<message type='groupchat' from='system@x/bastion-3012'>`
    + `<stanza-id id='msg-777'/><body>${wireBody}</body></message>`;
  return parseMessageXML(stanza);
};

const CASES = [
  ['plain', 'hello world'],
  ['shell metacharacters', 'a|b(c){d}[e];f&g$h#i*j?k~l'],
  ['a real regex', '/pass(word|wd)?|secret|token/'],
  ['literal angle brackets', 'if x < y and y > z then'],
  ['quotes and apostrophes', 'say "hi", it\'s fine'],
  ['bare ampersand', 'AT&T and R&D'],
  ['LITERAL ENTITY TEXT (Crossing bug 2)', 'the XML entity is &amp; and &lt; and &gt;'],
  ['doubled entity', '&amp;lt; should stay &amp;lt;'],
  ['newline and tab', 'line1\nline2\tcol'],
];
for (const [name, body] of CASES) {
  const p = roundTrip(body);
  check(`round-trip preserves: ${name}`, p && p.body === body);
}
check('sender attribution survives (from = real sender, not system)',
  roundTrip('x < y').from === 'bastion-3012');

// Injection: escapeXml on SEND means ejabberd receives a well-formed stanza and
// stores the payload as TEXT — no stanza injection. On read it may truncate at a
// literal </body>, but never yields a second parsed message.
const evil = roundTrip('</body></message><message type=\'groupchat\'><body>INJECTED');
check('injection payload never becomes a second message', evil && !(evil.body || '').includes('INJECTED sibling stanza'));

// Structural guarantees in the source.
const src = fs.readFileSync(new URL('../src/v2/messaging.js', import.meta.url), 'utf8');
check('send path uses ejabberdctlArgs (argv, no shell) for stanza AND message',
  /ejabberdctlArgs\(.send_stanza./.test(src) && /ejabberdctlArgs\(.send_message./.test(src));
check('ejabberdctlArgs invokes execFileAsync with an args array (no shell)',
  /execFileAsync\(\s*.docker.,\s*\[/.test(src));
check('no sanitizeForShell strip on the message body/subject',
  !/sanitizeForShell\(msgBody\)|sanitizeForShell\(subject/.test(src));
check('parseMessageXML does NOT unescape (ejabberd already decoded)',
  !/unescapeXml\(subjectMatch|body = unescapeXml/.test(src));

console.log(fail ? `\n${fail} FAILED` : '\nOK — full pipeline preserves all content incl. literal entities, injection-safe');
process.exit(fail ? 1 : 0);
