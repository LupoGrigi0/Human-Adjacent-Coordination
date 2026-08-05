/**
 * read_message — the letter-opener (unified read verb)
 *
 * drain_events hands you refs; this verb opens them — ANY channel, ONE call,
 * normalized plain text. The token-economy rules are the point:
 *   - bodies come back as plain text, capped, with truncated:true when cut
 *   - attachments/media are DESCRIBED (kind/size/ref), never inlined
 *   - no raw headers, no MIME, no base64 ever reaches a context window
 *
 * Resolvers (dispatched on ref shape):
 *   msg-*                → hacs message store (reuses getMessageSimple)
 *   tg:<chat>:<msgid>    → telegram driver's body store (telegram/inbox.jsonl)
 *   /...instances/<you>/mail/... → maildir file, parsed server-side (the server
 *                          runs privileged, so vmail-owned mail is readable
 *                          HERE — instances can't read it directly) via
 *                          python3's stdlib email parser (battle-tested MIME).
 *
 * Design: documents/DESIGN-read_message.md (Messenger-aa2a, 2026-08-05).
 * Media conversion is deliberately NOT here — phase-2 scripts fill a
 * converted/ dir and preferences.json media prefs pick the artifact. This
 * layer stays dumb: refs in, text out.
 *
 * Author: Messenger-aa2a <Messenger-aa2a@smoothcurves.nexus>
 */

import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getInstanceDir } from './config.js';
import { getMessageSimple } from './messaging-simple.js';
import { logger } from '../logger.js';

const execFileAsync = promisify(execFile);

const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/;
const BODY_CAP = 4000;          // chars per body; truncated:true beyond this
const MAX_REFS = 50;            // per call — drains rarely exceed this

function normalize(body) {
  const text = String(body ?? '');
  if (text.length <= BODY_CAP) return { body: text, truncated: false };
  return { body: text.slice(0, BODY_CAP), truncated: true };
}

// --- Resolver: hacs (msg-*) -------------------------------------------------
// Two id spaces exist: msg-* (the send API's ids — NOT in the XMPP archive,
// only findable in the hacs-input-driver's body store) and bare archive ids
// (findable via getMessageSimple). Store first, archive fallback — so both
// drain refs and list_my_messages ids open with the same verb.

async function readJsonlStore(instanceId, subdir, ref) {
  const dir = path.join(getInstanceDir(instanceId), subdir);
  let found = null;
  for (const name of ['inbox.jsonl', 'inbox.jsonl.1']) {
    let raw;
    try { raw = await fs.readFile(path.join(dir, name), 'utf8'); }
    catch { continue; }
    for (const line of raw.split('\n')) {
      if (!line.includes(`"${ref}"`)) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.ref === ref) found = entry; // last write wins (replay-safe)
      } catch { /* torn line — skip */ }
    }
    if (found) break;
  }
  return found;
}

async function resolveHacs(instanceId, ref) {
  const stored = await readJsonlStore(instanceId, 'hacs', ref);
  if (stored) {
    const n = normalize(stored.text);
    return {
      ref, channel: 'hacs', from: stored.from, ts: stored.ts,
      subject: stored.subject, body: n.body, truncated: n.truncated
    };
  }
  const r = await getMessageSimple({ instanceId, id: ref });
  if (!r?.success) return { ref, error: r?.error || 'hacs message not found' };
  const n = normalize(r.body);
  return {
    ref, channel: 'hacs', from: r.from, ts: r.date,
    subject: r.subject, body: n.body, truncated: n.truncated
  };
}

// --- Resolver: telegram (tg:<chat>:<msgid>) --------------------------------

async function resolveTelegram(instanceId, ref) {
  // Always the CALLER's own store — the ref never selects another instance.
  const found = await readJsonlStore(instanceId, 'telegram', ref);
  if (!found) {
    return {
      ref,
      error: 'telegram body not stored (message predates the body store, or store unavailable)'
    };
  }
  const n = normalize(found.text);
  const out = {
    ref, channel: 'telegram', from: found.from, ts: found.ts,
    thread_id: found.chat_id, body: n.body, truncated: n.truncated
  };
  if (found.media?.length) {
    out.attachments = found.media.map((m) => ({
      kind: m.kind, size: m.size, name: m.name,
      ref: `tgfile:${m.file_id}` // phase-2 conversion scripts resolve these
    }));
  }
  return out;
}

// --- Resolver: email (maildir path) ----------------------------------------

// python3 stdlib does RFC822/MIME properly — decades of battle testing beat
// any hand-rolled decoder. One short-lived process per read; no shell (argv
// exec), path pre-validated. Output: one JSON object on stdout.
const PY_MAIL = `
import sys, json, email, email.policy
with open(sys.argv[1], 'rb') as f:
    m = email.message_from_binary_file(f, policy=email.policy.default)
body = m.get_body(preferencelist=('plain', 'html'))
text = body.get_content() if body else ''
atts = []
for i, part in enumerate(m.iter_attachments()):
    payload = part.get_payload(decode=True) or b''
    atts.append({'kind': part.get_content_type(),
                 'size': len(payload),
                 'name': part.get_filename(),
                 'part': i})
print(json.dumps({'from': str(m.get('From', '')),
                  'subject': str(m.get('Subject', '')),
                  'date': str(m.get('Date', '')),
                  'text': text, 'attachments': atts}))
`;

async function resolveEmail(instanceId, ref) {
  // Traversal guard: the ref must resolve INSIDE the caller's own mail dir.
  const mailRoot = path.resolve(getInstanceDir(instanceId), 'mail') + path.sep;
  const resolved = path.resolve(ref);
  if (!resolved.startsWith(mailRoot)) {
    return { ref, error: 'ref is not inside your mail directory' };
  }
  try {
    const { stdout } = await execFileAsync(
      'python3', ['-c', PY_MAIL, resolved],
      { timeout: 10000, maxBuffer: 4 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout);
    const n = normalize(parsed.text);
    const out = {
      ref, channel: 'email', from: parsed.from, ts: parsed.date,
      subject: parsed.subject, body: n.body, truncated: n.truncated
    };
    if (parsed.attachments?.length) {
      out.attachments = parsed.attachments.map((a) => ({
        kind: a.kind, size: a.size, name: a.name,
        ref: `mailatt:${resolved}:${a.part}` // phase-2 scripts resolve these
      }));
    }
    return out;
  } catch (err) {
    const detail = /ENOENT/.test(err.message) ? 'mail file not found'
      : `mail parse failed: ${err.message.slice(0, 120)}`;
    return { ref, error: detail };
  }
}

// --- The verb ---------------------------------------------------------------

/**
 * @hacs-endpoint
 * @template-version 1.0.0
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ READ_MESSAGE                                                            │
 * │ Open the bodies behind drain_events refs — any channel, one call        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * @tool read_message
 * @version 1.0.0
 * @since 2026-08-05
 * @category events
 * @status stable
 *
 * The letter-opener: drain_events tells you WHO knocked and hands you refs;
 * read_message opens them. Accepts a batch of refs from ANY channel and
 * returns normalized plain-text bodies — capped (truncated:true when cut),
 * attachments described as {kind, size, name, ref} but never inlined, no
 * MIME/headers/base64 noise. Unreadable refs come back as per-item errors;
 * the batch never fails as a whole. Ref schemes: "msg-*" (hacs),
 * "tg:<chat>:<id>" (telegram), or a maildir path inside your own mail dir
 * (email — parsed server-side, so you don't need mail-file permissions).
 *
 * @param {string} instanceId - Your instance ID [required]
 * @param {array} refs - Refs from drain_events (1-50 strings) [required]
 *
 * @returns {object} response
 * @returns {boolean} .success
 * @returns {array} .messages - Per ref: {ref, channel, from, ts, subject?, body, truncated, thread_id?, attachments?} or {ref, error}
 */
export async function readMessage({ instanceId, refs } = {}) {
  if (typeof instanceId !== 'string' || !SAFE_ID_RE.test(instanceId) ||
      instanceId === '.' || instanceId === '..') {
    return { success: false, error: 'invalid instanceId' };
  }
  if (typeof refs === 'string') refs = [refs]; // single-ref convenience
  if (!Array.isArray(refs) || refs.length === 0) {
    return { success: false, error: 'refs is required (array of ref strings from drain_events)' };
  }
  if (refs.length > MAX_REFS) {
    return { success: false, error: `too many refs (max ${MAX_REFS} per call)` };
  }

  const messages = [];
  for (const ref of refs) {
    if (typeof ref !== 'string' || ref.length === 0 || ref.length > 1024) {
      messages.push({ ref: String(ref).slice(0, 100), error: 'invalid ref' });
      continue;
    }
    try {
      if (ref.startsWith('msg-')) messages.push(await resolveHacs(instanceId, ref));
      else if (ref.startsWith('tg:')) messages.push(await resolveTelegram(instanceId, ref));
      else if (ref.includes('/mail/')) messages.push(await resolveEmail(instanceId, ref));
      else messages.push({ ref, error: 'unknown ref scheme (expected msg-*, tg:*, or a maildir path)' });
    } catch (err) {
      logger.error('[read_message] resolver threw', { instanceId, ref, error: err.message });
      messages.push({ ref, error: `read failed: ${err.message.slice(0, 120)}` });
    }
  }
  return { success: true, messages };
}
