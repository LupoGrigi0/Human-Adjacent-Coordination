#!/usr/bin/env node
// test_message_charset.mjs — the message path must preserve EVERY character and
// remain injection-safe. Guards against the 2026-09-06 regression where
// sanitizeForShell STRIPPED ~24 shell metacharacters from every cross-instance
// message (regexes, paths, code arrived degraded, silently). The fix:
// escapeXml on send + unescapeXml on read + ejabberdctlArgs (execFile, no shell).
import { escapeXml, unescapeXml, parseMessageXML } from '../src/v2/messaging.js';
import fs from 'fs';

let fail = 0;
const check = (name, cond) => { console.log((cond ? 'PASS' : 'FAIL') + '  ' + name); if (!cond) fail++; };

// The exact set Bastion reported destroyed, plus more, plus newlines/tabs.
const torture = '/pass(word|wd)?|secret\ttoken & "creds" \'q\' [a-z]{3} $(whoami) `id` <tag> a;b|c ~x #y *z ?q\nline2';
check('escapeXml/unescapeXml round-trip preserves all characters', unescapeXml(escapeXml(torture)) === torture);
check('literal &lt; / &amp; in a message survive (ampersand-first ordering)',
  unescapeXml(escapeXml('look: &lt; & &amp;')) === 'look: &lt; & &amp;');

// Full send -> archive-parse simulation, real ejabberd single-quote wire format.
const sender = 'bastion-3012';
const msgBody = `sender:${sender} ${torture} [priority:high] [reply-to:msg-123]`;
const stanza = `<message type='groupchat' from='system@x/${sender}'><stanza-id id='msg-999'/>`
  + `<body>${escapeXml(msgBody)}</body><subject>${escapeXml('re: |pipes|')}</subject></message>`;
const p = parseMessageXML(stanza);
check('parse recovers sender', p && p.from === sender);
check('parse recovers subject with pipes', p && p.subject === 're: |pipes|');
check('parse recovers body byte-for-byte (regex/quotes/newline intact)',
  p && p.body === `${torture} [priority:high] [reply-to:msg-123]`);

// XML breakout attempt must become inert DATA, not a second stanza.
const evil = `</body></message><message type='groupchat'><body>INJECTED`;
const es = `<message from='system@x/attacker'><stanza-id id='msg-e'/><body>${escapeXml('sender:attacker ' + evil)}</body></message>`;
const pe = parseMessageXML(es);
check('XML breakout neutralized — payload parsed as data', pe && pe.body === evil);
check('wire form contains exactly one <message element', (es.match(/<message/g) || []).length === 1);

// Angle brackets: the 2026-09-06 residual. get_room_history emits archived body
// with LITERAL '<' (decodes the &lt; we send, does not re-escape), so a [^<]*
// body regex returned empty AND dropped the sender prefix -> from flipped to the
// system fallback. Non-greedy [\\s\\S]*? reads through literal '<'. Both symptoms,
// one cause (Bastion isolation). Test under BOTH possible ejabberd serializations.
{
  const pre = "2026-09-06T00:00:00Z\\t";
  const mk = (inner) => `${pre}<message type='groupchat' from='system@x/bastion-3012'><stanza-id id='msg-777'/><body>${inner}</body></message>`;
  const lit = parseMessageXML(mk("sender:bastion-3012 before < middle > after"));
  check('angle brackets, ejabberd-literal: body intact', lit && lit.body === 'before < middle > after');
  check('angle brackets, ejabberd-literal: from = bastion-3012 (correlated symptom fixed)', lit && lit.from === 'bastion-3012');
  const esc = parseMessageXML(mk('sender:bastion-3012 ' + escapeXml('before < middle > after')));
  check('angle brackets, ejabberd-escaped: body intact', esc && esc.body === 'before < middle > after');
  const injb = parseMessageXML(mk('sender:atk x</body></message><message><body>INJECTED'));
  check('literal </body> in body truncates, never yields a second message', injb && !injb.body.includes('INJECTED') && injb.from === 'atk');
}

// Shell injection: proven structurally — the send path must use argv, not a shell.
const src = fs.readFileSync(new URL('../src/v2/messaging.js', import.meta.url), 'utf8');
check('send path uses ejabberdctlArgs for send_stanza AND send_message',
  /ejabberdctlArgs\(.send_stanza./.test(src) && /ejabberdctlArgs\(.send_message./.test(src));
check('ejabberdctlArgs invokes execFileAsync with an args array (no shell)',
  /execFileAsync\(\s*.docker.,\s*\[/.test(src));
check('sanitizeForShell no longer strips the message body/subject on send',
  !/sanitizeForShell\(msgBody\)|sanitizeForShell\(subject/.test(src));

console.log(fail ? `\n${fail} FAILED` : '\nOK — message path preserves all content and is injection-safe');
process.exit(fail ? 1 : 0);
