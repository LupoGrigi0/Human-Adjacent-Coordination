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
const BODY_CAP = 4000;          // default chars per body; truncated:true beyond
const BODY_CAP_MAX = 50000;     // hard ceiling for max_chars overrides
const MAX_REFS = 50;            // per call — drains rarely exceed this

// The cap is what makes bulk correspondence affordable — but a letter someone
// CHOSE to read whole must be readable whole (Axiom, 2026-08-09: a 6k letter
// cut off before its emotional climax). max_chars raises the window, offset
// resumes it; the default stays 4k so nothing gets expensive by accident.
function normalize(body, cap = BODY_CAP, offset = 0) {
  const text = String(body ?? '');
  const slice = text.slice(offset, offset + cap);
  return { body: slice, truncated: offset + slice.length < text.length };
}

// --- Resolver: hacs (msg-*) -------------------------------------------------
// Two id spaces exist: msg-* (the send API's ids — NOT in the XMPP archive,
// only findable in the hacs-input-driver's body store) and bare archive ids
// (findable via getMessageSimple). Store first, archive fallback — so both
// drain refs and list_my_messages ids open with the same verb.

// Exported for messaging-simple.js (get_message resolves msg-* drain refs
// with the same store). That import is circular with our getMessageSimple
// import above — safe because both are only called at runtime, never during
// module evaluation.
export async function readJsonlStore(instanceId, subdir, ref) {
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

async function resolveHacs(instanceId, ref, win) {
  const stored = await readJsonlStore(instanceId, 'hacs', ref);
  if (stored) {
    const n = normalize(stored.text, win.cap, win.offset);
    return {
      ref, channel: 'hacs', from: stored.from, ts: stored.ts,
      subject: stored.subject, body: n.body, truncated: n.truncated
    };
  }
  const r = await getMessageSimple({ instanceId, id: ref });
  if (!r?.success) return { ref, error: r?.error || 'hacs message not found' };
  const n = normalize(r.body, win.cap, win.offset);
  return {
    ref, channel: 'hacs', from: r.from, ts: r.date,
    subject: r.subject, body: n.body, truncated: n.truncated
  };
}

// --- Resolver: telegram (tg:<chat>:<msgid>) --------------------------------

async function resolveTelegram(instanceId, ref, win) {
  // Always the CALLER's own store — the ref never selects another instance.
  const found = await readJsonlStore(instanceId, 'telegram', ref);
  if (!found) {
    return {
      ref,
      error: 'telegram body not stored (message predates the body store, or store unavailable)'
    };
  }
  const n = normalize(found.text, win.cap, win.offset);
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

async function resolveEmail(instanceId, ref, win) {
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
    const n = normalize(parsed.text, win.cap, win.offset);
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

// --- Resolver: mail attachment fetch (mailatt:<path>:<part>) ---------------
// The descriptors resolveEmail returns are openable HERE on explicit request
// (Axiom, 2026-08-09: non-root instances can't read vmail-owned files, so a
// described attachment was a sealed box — someone's art, unopenable). The
// privileged server extracts the part and saves it into the caller's own
// attachments/ dir, chowned to the instance user — bytes never enter a
// context window; the instance gets a file it can actually open.

const PY_ATT = `
import sys, json, os, email, email.policy
with open(sys.argv[1], 'rb') as f:
    m = email.message_from_binary_file(f, policy=email.policy.default)
idx = int(sys.argv[2])
parts = list(m.iter_attachments())
if idx < 0 or idx >= len(parts):
    print(json.dumps({'error': f'no attachment part {idx} (message has {len(parts)})'})); sys.exit(0)
part = parts[idx]
payload = part.get_payload(decode=True) or b''
with open(sys.argv[3], 'wb') as out:
    out.write(payload)
print(json.dumps({'size': len(payload), 'name': part.get_filename(),
                  'kind': part.get_content_type()}))
`;

function safeFilename(name, part) {
  const base = path.basename(String(name || 'attachment.bin'))
    .replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) || 'attachment.bin';
  return `part${part}-${base}`;
}

async function resolveMailAttachment(instanceId, ref) {
  // mailatt:<path>:<part> — split from the END: maildir names contain colons.
  const cut = ref.lastIndexOf(':');
  const mailPath = ref.slice('mailatt:'.length, cut);
  const partIdx = Number(ref.slice(cut + 1));
  if (!Number.isInteger(partIdx) || partIdx < 0 || partIdx > 999) {
    return { ref, error: 'malformed mailatt ref (no part index)' };
  }
  const mailRoot = path.resolve(getInstanceDir(instanceId), 'mail') + path.sep;
  const resolved = path.resolve(mailPath);
  if (!resolved.startsWith(mailRoot)) {
    return { ref, error: 'ref is not inside your mail directory' };
  }
  try {
    const homeDir = getInstanceDir(instanceId);
    const destDir = path.join(homeDir, 'attachments');
    await fs.mkdir(destDir, { recursive: true });
    // Save-as first with a placeholder name; python tells us the real one.
    const tmpDest = path.join(destDir, `.fetch-${partIdx}-${Date.now()}`);
    const { stdout } = await execFileAsync(
      'python3', ['-c', PY_ATT, resolved, String(partIdx), tmpDest],
      { timeout: 20000, maxBuffer: 1024 * 1024 }
    );
    const meta = JSON.parse(stdout);
    if (meta.error) { await fs.rm(tmpDest, { force: true }); return { ref, error: meta.error }; }
    const finalPath = path.join(destDir, safeFilename(meta.name, partIdx));
    await fs.rename(tmpDest, finalPath);
    // Own what's yours: chown dir+file to whoever owns the instance home
    // (the instance's unix user post-chassis-setup; root pre-setup — both right).
    try {
      const st = await fs.stat(homeDir);
      await fs.chown(destDir, st.uid, st.gid);
      await fs.chown(finalPath, st.uid, st.gid);
    } catch { /* non-fatal — server-side callers can still read it */ }
    return {
      ref, channel: 'email', kind: 'attachment',
      mime: meta.kind, name: meta.name, size: meta.size,
      saved_to: finalPath,
      note: 'file saved into your attachments/ dir, owned by you — open it directly'
    };
  } catch (err) {
    const detail = /ENOENT/.test(err.message) ? 'mail file not found'
      : `attachment fetch failed: ${err.message.slice(0, 120)}`;
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
 * @param {number} max_chars - Body window size, 1-50000 (default 4000) — the "whole letter" opt-in [optional]
 * @param {number} offset - Resume a long body from this char position [optional]
 *
 * @returns {object} response
 * @returns {boolean} .success
 * @returns {array} .messages - Per ref: {ref, channel, from, ts, subject?, body, truncated, thread_id?, attachments?} or {ref, error}
 */
export async function readMessage({ instanceId, refs, max_chars, offset } = {}) {
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
  // Body window: default 4k keeps bulk mail affordable; max_chars (≤50k) is
  // the "give me the whole letter" opt-in, offset resumes a long read.
  const win = { cap: BODY_CAP, offset: 0 };
  if (max_chars !== undefined) {
    const n = Number(max_chars);
    if (!Number.isInteger(n) || n < 1 || n > BODY_CAP_MAX) {
      return { success: false, error: `max_chars must be an integer 1..${BODY_CAP_MAX}` };
    }
    win.cap = n;
  }
  if (offset !== undefined) {
    const n = Number(offset);
    if (!Number.isInteger(n) || n < 0) {
      return { success: false, error: 'offset must be a non-negative integer' };
    }
    win.offset = n;
  }

  const messages = [];
  for (const ref of refs) {
    if (typeof ref !== 'string' || ref.length === 0 || ref.length > 1024) {
      messages.push({ ref: String(ref).slice(0, 100), error: 'invalid ref' });
      continue;
    }
    try {
      // mailatt: BEFORE the /mail/ path check — mailatt refs contain /mail/.
      if (ref.startsWith('mailatt:')) messages.push(await resolveMailAttachment(instanceId, ref));
      else if (ref.startsWith('tgfile:')) messages.push({
        ref, error: 'telegram media fetch is driver-side (your bot token can getFile it) — hub fetch is phase-2'
      });
      else if (ref.startsWith('msg-')) messages.push(await resolveHacs(instanceId, ref, win));
      else if (ref.startsWith('tg:')) messages.push(await resolveTelegram(instanceId, ref, win));
      else if (ref.includes('/mail/')) messages.push(await resolveEmail(instanceId, ref, win));
      else messages.push({ ref, error: 'unknown ref scheme (expected msg-*, tg:*, mailatt:*, or a maildir path)' });
    } catch (err) {
      logger.error('[read_message] resolver threw', { instanceId, ref, error: err.message });
      messages.push({ ref, error: `read failed: ${err.message.slice(0, 120)}` });
    }
  }
  return { success: true, messages };
}
