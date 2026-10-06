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
import { getMessageSimple, markAsRead, getReadMessages } from './messaging-simple.js';
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
// `truncated: true` is a FACT WITH NO AFFORDANCE, and that is a defect. On
// 2026-10-03 Axiom hit a ~4k ceiling on a human's creative writing, concluded
// there was no way past it, and emailed her to retype the ending — while
// max_chars (1-50000) and offset had been in the served tool schema the whole
// time. "I could not reach it" reported as "it does not exist", and this time a
// person paid for it.
//
// So the response now carries its own continuation handle: how much is left, and
// the exact call that fetches it. Same principle as `unmarked` carrying the
// mark_read handle — a boundary must say its own name, and an obligation or a
// remainder that the caller has to already know about is one that gets missed.
// A client whose cached schema omits max_chars still receives the instruction.
function normalize(body, cap = BODY_CAP, offset = 0) {
  const text = String(body ?? '');
  const slice = text.slice(offset, offset + cap);
  const end = offset + slice.length;
  const truncated = end < text.length;
  // ALL FOUR ARE UNCONDITIONAL. They used to appear only inside `if (truncated)`,
  // which is the same conditional-field defect I fixed in the unread counts hours
  // earlier — reproduced in a different field, by me, in the fix for the first one.
  // Caught by Cairn-2001's PRE-REGISTERED prediction P7, written before the deploy
  // and without access to this source. He predicted I had got it right.
  //
  // Two concrete costs, not just symmetry: `total_chars` is useful on a COMPLETE
  // read ("how big is this letter?") and used to require deliberately truncating
  // one to learn it; and a paging loop needed a special case for its last page.
  // Unconditional, the loop is uniform: read -> advance to next_offset -> stop when
  // remaining_chars is 0.
  //
  // THE RULE, now applied everywhere: no count appears only when nonzero, and no
  // flag appears only when true. A boundary must say its own name.
  return {
    body: slice,
    truncated,
    total_chars: text.length,
    remaining_chars: text.length - end,
    next_offset: truncated ? end : null,   // null = there is no next page
    continue_with: truncated
      ? `read_message({instanceId, refs:[ref], offset:${end}})`
        + ` — or refetch with max_chars up to ${BODY_CAP_MAX} for the whole letter`
      : null,
  };
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
      subject: stored.subject, ...n
    };
  }
  const r = await getMessageSimple({ instanceId, id: ref });
  if (!r?.success) return { ref, error: r?.error || 'hacs message not found' };
  const n = normalize(r.body, win.cap, win.offset);
  return {
    ref, channel: 'hacs', from: r.from, ts: r.date,
    subject: r.subject, ...n
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
    thread_id: found.chat_id, ...n
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
      subject: parsed.subject, ...n
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

// ─── Read state ─────────────────────────────────────────────────────────────
// The doorbell path (drain_events -> read_message) recorded NOTHING read, for any
// channel, while the legacy path (list_my_messages -> get_message) did. Two read
// paths, divergent read-state: a chassis mind left every letter permanently unread
// and do_i_have_new_messages kept insisting it was new. Fifth sighting of one
// concept implemented N times and agreeing by luck — the input that changed was
// the doorbell existing at all. Found answering Lodestone-8ec9's RFC-0001 question
// about whether "still unread" is derivable on the hub. It was not, and the reason
// was mine. (tests/test_read_state.mjs)
//
// TWO RULES, pulling against each other on purpose:
//  * NEVER INFER. read_message returns a 4000-char window with truncated:true;
//    marking a partially-read letter read is its own silent loss. "I have read
//    this" is a claim only the mind can make.
//  * NEVER SILENT. A verb you must remember is a habit, and habits detect while
//    mechanisms prevent. So read_message SURFACES the obligation (read_state per
//    ref, `unmarked` on the batch): forgetting becomes loud, not invisible.
//    (not-counted is never healthy — Bastion-3012, from a check that reported
//    ok:10 while one of the ten was dead.)
// hacs read-tracking is REUSED from messaging-simple, never reimplemented — a
// second implementation is precisely how we got here.

const MAILDIR_SEEN = 'S';

// maildir: <base>:2,<FLAGS>, in cur/ once read. A 1995 standard we have been
// storing mail in and never honouring — resolveEmail parses in place and leaves
// the file exactly where it found it.
function maildirSplit(filePath) {
  const dir = path.dirname(filePath);
  const name = path.basename(filePath);
  const i = name.indexOf(':2,');
  return {
    dir, name,
    base: i >= 0 ? name.slice(0, i) : name,
    flags: i >= 0 ? name.slice(i + 3) : '',
    box: path.basename(dir),
    root: path.dirname(dir),
  };
}

function maildirIsSeen(filePath) {
  const { box, flags } = maildirSplit(filePath);
  return box === 'cur' && flags.includes(MAILDIR_SEEN);
}

// new/ -> cur/ with the Seen flag added, preserving flags already present.
async function maildirMarkSeen(filePath) {
  const { base, flags, root } = maildirSplit(filePath);
  const next = [...new Set((flags + MAILDIR_SEEN).split(''))].sort().join('');
  const dest = path.join(root, 'cur', `${base}:2,${next}`);
  if (path.resolve(dest) === path.resolve(filePath)) return dest;
  await fs.mkdir(path.join(root, 'cur'), { recursive: true });
  await fs.rename(filePath, dest);
  return dest;
}

// telegram has no read-state mechanism at all — genuinely new state.
async function telegramReadSet(instanceId) {
  try {
    const raw = await fs.readFile(
      path.join(getInstanceDir(instanceId), 'telegram', 'read.json'), 'utf8');
    return new Set(JSON.parse(raw)?.read || []);
  } catch { return new Set(); }
}

async function telegramMarkRead(instanceId, refs) {
  const dir = path.join(getInstanceDir(instanceId), 'telegram');
  const set = await telegramReadSet(instanceId);
  for (const r of refs) set.add(r);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'read.json'),
    JSON.stringify({ read: [...set].slice(-1000) }, null, 2));
}

// 'read' | 'unread' | 'unknown'. 'unknown' is honest and is never a quiet 'read':
// an attachment ref has no read-state of its own and must not be reported as either.
async function refReadState(instanceId, ref, hacsRead, tgRead) {
  if (ref.startsWith('msg-')) return hacsRead.has(ref) ? 'read' : 'unread';
  if (ref.startsWith('tg:')) return tgRead.has(ref) ? 'read' : 'unread';
  if (ref.startsWith('mailatt:') || ref.startsWith('tgfile:')) return 'unknown';
  if (ref.includes('/mail/')) {
    try { return maildirIsSeen(ref) ? 'read' : 'unread'; } catch { return 'unknown'; }
  }
  return 'unknown';
}

/**
 * @hacs-endpoint
 * @tool mark_read
 * @version 1.0.0
 * @since 2026-10-01
 * @category events
 * @status stable
 *
 * @description
 * Record that you have read these refs. The mind asserts it; the infrastructure
 * never infers it. Batches 1-50 to match read_message, because an obligation
 * that costs fifty round trips is one that gets skipped. Dispatches by ref
 * scheme: hacs -> read_messages.json (shared with get_message, not a second
 * implementation), email -> maildir new/->cur/ and the :2,S Seen flag,
 * telegram -> its own read store.
 *
 * @param {string} instanceId - Your instance ID [required]
 * @param {array} refs - Refs from drain_events / read_message (1-50) [required]
 * @param {boolean} receipt - NOT IMPLEMENTED in v1 (RFC-0001 section 9) [optional]
 *
 * @returns {object} response
 * @returns {boolean} .success
 * @returns {array} .results - Per ref {ref, channel, marked} or {ref, error}
 */
export async function markRead({ instanceId, refs, receipt } = {}) {
  if (typeof instanceId !== 'string' || !instanceId) {
    return { success: false, error: 'instanceId is required' };
  }
  if (!Array.isArray(refs) || refs.length === 0) {
    return { success: false, error: 'refs is required (array of ref strings)' };
  }
  if (refs.length > MAX_REFS) {
    return { success: false, error: `too many refs (max ${MAX_REFS} per call)` };
  }

  const results = [];
  const hacsIds = [];
  const tgIds = [];

  for (const ref of refs) {
    if (typeof ref !== 'string' || !ref || ref.length > 1024) {
      results.push({ ref: String(ref).slice(0, 100), error: 'invalid ref' });
      continue;
    }
    try {
      if (ref.startsWith('msg-')) {
        hacsIds.push(ref); results.push({ ref, channel: 'hacs', marked: true });
      } else if (ref.startsWith('tg:')) {
        tgIds.push(ref); results.push({ ref, channel: 'telegram', marked: true });
      } else if (!ref.startsWith('mailatt:') && ref.includes('/mail/')) {
        // Traversal guard — same rule resolveEmail uses: inside your own maildir.
        const mailRoot = path.resolve(getInstanceDir(instanceId), 'mail') + path.sep;
        if (!path.resolve(ref).startsWith(mailRoot)) {
          results.push({ ref, error: 'ref is outside your mail directory' });
        } else {
          const dest = await maildirMarkSeen(ref);
          results.push({ ref, channel: 'email', marked: true, now: dest });
        }
      } else {
        results.push({ ref, error: 'ref scheme has no read-state (attachments and media are not letters)' });
      }
    } catch (err) {
      // FAIL LOUDLY. A mark_read that swallows errors and reports success is the
      // same defect as a send that reports success into a room that does not exist.
      logger.error('[mark_read] failed', { instanceId, ref, error: err.message });
      results.push({ ref, error: `mark failed: ${err.message.slice(0, 120)}` });
    }
  }

  if (hacsIds.length) await markAsRead(instanceId, hacsIds);
  if (tgIds.length) await telegramMarkRead(instanceId, tgIds);

  const out = { success: true, results };
  if (receipt !== undefined) {
    // Never silently accept a parameter and do nothing with it.
    out.receipt = 'unsupported_v1';
    out.receipt_note = 'read receipts are RFC-0001 section 9 and are not built yet; '
      + 'read-state WAS recorded. A receipt is a disclosure to a third party and '
      + 'must never be implied by a batch.';
  }
  return out;
}


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
 * @param {boolean} mark_read - Explicitly assert you have read these, in the same
 *   call. NOT inference — you are asserting it. Refs whose body came back
 *   TRUNCATED are deliberately NOT marked (a partial read is not a read) and are
 *   returned in `mark_read_skipped`. Exists as a PARAM because a new tool cannot
 *   reach an already-running session: tool lists are negotiated once at startup,
 *   while unknown params are forwarded. So the hint must not point at a wall.
 *   (Distinction found by Axiom, 2026-10-03, by testing rather than assuming.)
 *
 * @returns {object} response
 * @returns {boolean} .success
 * @returns {array} .messages - Per ref: {ref, channel, from, ts, subject?, body, truncated, thread_id?, attachments?} or {ref, error}
 */
export async function readMessage({ instanceId, refs, max_chars, offset, mark_read } = {}) {
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

  // Read-state is SURFACED, never inferred: reading a 4000-char window is not
  // reading the letter. The mind discharges the obligation with mark_read.
  const hacsRead = await getReadMessages(instanceId);
  const tgRead = await telegramReadSet(instanceId);

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
  // Annotate each message with read-state and hand back what is still outstanding.
  // `unmarked` is the handle: forgetting becomes loud, without the fetch ever
  // claiming the mind read anything.
  for (const m of messages) {
    if (m && typeof m.ref === 'string' && m.error === undefined) {
      m.read_state = await refReadState(instanceId, m.ref, hacsRead, tgRead);
    }
  }
  let unmarked = messages.filter((m) => m && m.read_state === 'unread').map((m) => m.ref);
  const out = { success: true, messages, unmarked };

  // mark_read:true — the mind asserting it read these, in the same call. This is
  // NOT the inference we rejected: the caller explicitly asked. It exists here
  // because a NEW TOOL cannot reach an already-running session (tool lists are
  // negotiated once; unknown params are forwarded), and a hint that names an
  // unreachable verb is an affordance pointing at a wall — the exact defect
  // fixed in truncation hours earlier and recreated one layer up.
  if (mark_read === true && unmarked.length) {
    // A TRUNCATED read is not a read. Marking a partial letter read is the
    // silent loss this whole design exists to refuse, so those are skipped and
    // named rather than quietly included.
    const complete = messages
      .filter((m) => m && m.read_state === 'unread' && m.error === undefined && m.truncated !== true)
      .map((m) => m.ref);
    const skipped = unmarked.filter((r) => !complete.includes(r));
    if (complete.length) {
      const res = await markRead({ instanceId, refs: complete });
      out.marked = res.results.filter((r) => r.marked).map((r) => r.ref);
      const failed = res.results.filter((r) => r.error);
      if (failed.length) out.mark_read_errors = failed;
      unmarked = unmarked.filter((r) => !out.marked.includes(r));
      out.unmarked = unmarked;
    }
    if (skipped.length) {
      out.mark_read_skipped = skipped;
      out.mark_read_skipped_reason = 'body was truncated — a partial read is not a read; '
        + 'refetch with max_chars or page with offset, then mark';
    }
  }

  if (unmarked.length) {
    out.hint = `${unmarked.length} of these are still unread — assert it with `
      + `read_message({instanceId, refs, mark_read:true}) in this same call, or `
      + `mark_read({instanceId, refs}) if your session has that tool`;
  }
  return out;
}
