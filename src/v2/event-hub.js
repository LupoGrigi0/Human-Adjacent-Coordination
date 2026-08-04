/**
 * HACS Event Hub — the pluggable nervous system (counter core)
 *
 * Drivers publish thin events here; the hub counts them per {instance, channel,
 * from} slot and dispatches AT MOST ONE active notification per slot to the
 * instance's chassis. Bodies NEVER pass through the hub — only opaque refs.
 * Instances drain the counter on their own schedule.
 *
 * Contract: docs/EVENT-HUB-CONTRACT.md (authoritative shapes, §1,3,5,6)
 * Spec:     Messenger-Event-Hub-Spec.md (Crossing-2d23)
 * Date:     2026-08-02
 */

import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import crypto from 'crypto';
import { writeJSON, ensureDir, readPreferences, writePreferences } from './data.js';
import { getInstancesDir, getInstanceDir } from './config.js';
import { logger } from '../logger.js';

const COUNTER_FILENAME = '.hacs-events.json';
const DEFAULT_SECRET_FILE = '/mnt/coordinaton_mcp_data/.hub-secret';
const MAX_REFS = 20;          // most-recent refs kept per slot (contract §3)
const MAX_LAST_ERRORS = 50;   // getStatus() error window (contract §6)
const RETRY_SWEEP_MS = 60000; // pending-slot re-dispatch cadence

// §8b hardening — path-traversal + prototype-pollution guards
const SAFE_ID_RE = /^[A-Za-z0-9._-]+$/;      // target/instanceId (used in paths)

// Interrupt-policy system defaults (contract §10): hacs is the colleague-to-
// colleague real-time fabric → interrupt ON; external channels are quiet by
// default, opt-in per instance (Genevieve/Axiom flip email on, etc.).
// Unknown/custom channels default QUIET — a new driver must earn interrupts.
// telegram defaults to interrupt (flipped 2026-08-04, Lupo's call): the channel
// requires explicit telegram-side setup (bot + chat pairing), so the default
// only ever reaches instances that deliberately wired telegram — and they wired
// it to be reachable. An instance with no telegram ID can never receive a
// telegram event, so the default is inert for everyone else. Round-trip wake
// proven in production (attended + unattended) before the flip.
const INTERRUPT_DEFAULTS = { hacs: true, email: false, telegram: true };
const SAFE_CHANNEL_RE = /^[a-z0-9_-]+$/i;    // channel names
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']); // exact `from` rejects

/**
 * §8b: verified reply_channel success is stamped delivered_via:<channel>
 * when the driver omits it (truthful; contract §5). Failures pass verbatim.
 */
function stampDeliveredVia(result, channel) {
  if (result && typeof result === 'object' && result.ok === true &&
      result.delivered_via === undefined) {
    return { ...result, delivered_via: channel };
  }
  return result;
}

function secretFilePath() {
  return process.env.HUB_SECRET_FILE || DEFAULT_SECRET_FILE;
}

function counterFilePath(instanceId) {
  return path.join(getInstanceDir(instanceId), COUNTER_FILENAME);
}

function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

// ---------------------------------------------------------------------------
// EventHub
// ---------------------------------------------------------------------------

class EventHub {
  constructor() {
    this.broker = null;             // EventBroker ref, wired by initHub()
    this.counters = new Map();      // instanceId → { channel: { from: slot } } — SOURCE OF TRUTH
    this.loaded = new Set();        // instanceIds whose counter file has been loaded/attempted
    this.writeChains = new Map();   // instanceId → Promise — serializes snapshot writes
    this.outbound = new Map();      // channel → fn(reply)→Promise | callback URL string
    this.lastErrors = [];           // rolling window of failures (queryable, never swallowed)
    this._retryTimer = null;
  }

  // -------------------------------------------------------------------------
  // publish() — driver → hub. SYNCHRONOUS counter path, async dispatch.
  // Zero latency between intake and (first) dispatch: no timers, no debounce.
  // -------------------------------------------------------------------------

  publish(payload) {
    // Validate — the hub NEVER crashes on malformed input (contract §9.6)
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { ok: false, error: 'publish payload must be an object' };
    }
    for (const field of ['target', 'channel', 'from', 'ref']) {
      if (typeof payload[field] !== 'string' || payload[field].length === 0) {
        return { ok: false, error: `${field} is required and must be a non-empty string` };
      }
    }
    if (payload.ts !== undefined && !Number.isFinite(payload.ts)) {
      return { ok: false, error: 'ts must be epoch seconds (number)' };
    }
    if (payload.thread_id !== undefined &&
        typeof payload.thread_id !== 'string' && typeof payload.thread_id !== 'number') {
      return { ok: false, error: 'thread_id must be a string' };
    }

    // §8b hardening — validated BEFORE any path construction or map keying:
    // target feeds file paths; channel/from key the counter maps.
    if (!SAFE_ID_RE.test(payload.target) || payload.target === '.' || payload.target === '..') {
      return { ok: false, error: 'invalid target' };
    }
    if (!SAFE_CHANNEL_RE.test(payload.channel)) {
      return { ok: false, error: 'invalid channel' };
    }
    if (FORBIDDEN_KEYS.has(payload.from)) {
      return { ok: false, error: 'invalid from' };
    }

    // Strip unknown fields (e.g. a smuggled `body`) — never forwarded (contract §1)
    const target = payload.target;
    const channel = payload.channel;
    const from = payload.from.slice(0, 200); // §8b: free text, truncated
    const ref = payload.ref;
    const bidirectional = payload.bidirectional === true;
    const ts = Number.isFinite(payload.ts) ? Math.floor(payload.ts) : nowEpochSeconds();
    const thread_id = payload.thread_id !== undefined ? String(payload.thread_id) : undefined;

    // Counter mutate — in-memory maps (null-prototype, §8b) are the source of
    // truth. Wrapped so an unexpected throw surfaces as {ok:false}, never a 500.
    try {
      this._ensureLoadedSync(target);
      let inst = this.counters.get(target);
      if (!inst) { inst = Object.create(null); this.counters.set(target, inst); }
      if (!inst[channel]) inst[channel] = Object.create(null);

      let slot = inst[channel][from];
      const wasIdle = !slot || slot.count === 0;
      if (!slot) {
        slot = { count: 0, status: 'active', last_ts: ts, refs: [] };
        inst[channel][from] = slot;
      }
      slot.count += 1;
      slot.last_ts = ts;
      slot.refs.push(ref);
      if (slot.refs.length > MAX_REFS) slot.refs.splice(0, slot.refs.length - MAX_REFS);
      if (bidirectional) slot.bidirectional = true;
      if (thread_id !== undefined) slot.thread_id = thread_id;

      // Write-through snapshot (tmp+rename, serialized per instance) — fire and chain
      this._scheduleSnapshot(target);

      // ≤1 active notification per slot: only a 0→active transition dispatches.
      // Arrivals while active/pending are a count bump behind the first notification.
      if (wasIdle) {
        slot.status = 'active';
        this._dispatch(target, channel, from, slot).catch((err) => {
          slot.status = 'pending'; // retry sweep will pick it up
          this._recordError('notify', `${target}/${channel}/${from}: ${err.message}`);
          this._scheduleSnapshot(target);
        });
      }

      return { ok: true, counter: slot.count };
    } catch (err) {
      this._recordError('publish', `${target}/${channel}/${from}: ${err.message}`);
      return { ok: false, error: err.message };
    }
  }

  // -------------------------------------------------------------------------
  // drain() — instance-facing. Read (and unless peek, clear) counter slots.
  // -------------------------------------------------------------------------

  /**
   * @hacs-endpoint
   * @template-version 1.0.0
   * ┌─────────────────────────────────────────────────────────────────────────┐
   * │ DRAIN_EVENTS                                                            │
   * │ Read (and clear) your pending event-hub notification counters           │
   * └─────────────────────────────────────────────────────────────────────────┘
   *
   * @tool drain_events
   * @version 1.0.0
   * @since 2026-08-02
   * @category events
   * @status stable
   *
   * @description
   * Read your pending thin-notification counters, grouped by channel and
   * sender. Each slot carries count, last_ts, and the most recent refs
   * (opaque ids you use to fetch the actual content, e.g. message IDs for
   * the 'hacs' channel). By default draining CLEARS the counters and frees
   * the active notification slot; pass peek=true to look without clearing.
   * No pending events returns {success: true, events: {}, cleared: false}.
   *
   * @param {string} instanceId - Your instance ID [required]
   * @param {string} channel - Only drain this channel (e.g. "email", "hacs") [optional]
   * @param {string} from - Only drain events from this sender [optional]
   * @param {boolean} peek - Return events without clearing counters (default: false)
   *
   * @returns {object} response
   * @returns {boolean} .success
   * @returns {object} .events - {channel: {from: {count, last_ts, refs, thread_id?, bidirectional?}}}
   * @returns {boolean} .cleared - True when counters were cleared by this call
   */
  async drain({ instanceId, channel, from, peek } = {}) {
    if (typeof instanceId !== 'string' || instanceId.length === 0) {
      return { success: false, error: 'instanceId is required' };
    }
    // §8b: instanceId feeds the counter-file path — validate BEFORE construction
    if (!SAFE_ID_RE.test(instanceId) || instanceId === '.' || instanceId === '..') {
      return { success: false, error: 'invalid instanceId' };
    }
    this._ensureLoadedSync(instanceId);
    const inst = this.counters.get(instanceId) || Object.create(null);

    const events = Object.create(null); // §8b: null-prototype, external keys
    let matched = false;
    for (const [ch, senders] of Object.entries(inst)) {
      if (channel && ch !== channel) continue;
      for (const [sender, slot] of Object.entries(senders)) {
        if (from && sender !== from) continue;
        if (!slot || slot.count === 0) continue;
        matched = true;
        if (!events[ch]) events[ch] = Object.create(null);
        const out = { count: slot.count, last_ts: slot.last_ts, refs: [...slot.refs] };
        if (slot.thread_id !== undefined) out.thread_id = slot.thread_id;
        if (slot.bidirectional) out.bidirectional = true;
        events[ch][sender] = out;
        if (!peek) {
          delete senders[sender]; // clearing frees the active slot (memory)
        }
      }
      if (!peek && Object.keys(senders).length === 0) delete inst[ch];
    }

    const cleared = matched && !peek;
    if (cleared) {
      // Durable before reporting cleared. On write failure be honest: memory IS
      // cleared (refs already handed out above), but the file still shows the
      // old counts — report cleared:false + error instead of claiming success.
      const write = await this._scheduleSnapshot(instanceId);
      if (!write?.ok) {
        return {
          success: true, events, cleared: false,
          error: `events cleared in memory but counter file write failed (stale counts on disk): ${write?.error || 'unknown error'}`
        };
      }
    }
    return { success: true, events, cleared };
  }

  // -------------------------------------------------------------------------
  // Outbound leg — reply_channel routing (transport-pure: NO inbox fallback
  // here; server.js wiring layer owns the HACS-inbox fallback).
  // -------------------------------------------------------------------------

  registerOutbound(channel, fnOrUrl) {
    this.outbound.set(channel, fnOrUrl); // re-register anytime; last writer wins
    logger.info(`[EventHub] outbound driver registered for '${channel}'`, {
      kind: typeof fnOrUrl === 'function' ? 'fn' : 'url'
    });
    return { ok: true };
  }

  /**
   * @hacs-endpoint
   * @template-version 1.0.0
   * ┌─────────────────────────────────────────────────────────────────────────┐
   * │ REPLY_CHANNEL                                                           │
   * │ Reply on a bidirectional external channel (telegram, email, ...)        │
   * └─────────────────────────────────────────────────────────────────────────┘
   *
   * @tool reply_channel
   * @version 1.0.0
   * @since 2026-08-02
   * @category events
   * @status stable
   *
   * @description
   * Send a reply back out through a bidirectional channel's outbound driver.
   * Use the thread_id you received with the notification (via drain_events).
   * The driver's verified result is returned verbatim: {ok: true,
   * delivered_via: "<channel>"} only after confirmed downstream delivery,
   * otherwise {ok: false, error}. If the driver is unreachable and the
   * thread resolves to a registered HACS instance, the reply falls back to
   * their HACS inbox ({ok: true, delivered_via: "hacs_inbox"}).
   *
   * @param {string} instanceId - Your instance ID [required]
   * @param {string} channel - Channel to reply on (e.g. "telegram") [required]
   * @param {string} thread_id - Thread ID from the notification [required]
   * @param {string} text - Reply text to send [required]
   *
   * @returns {object} response
   * @returns {boolean} .ok - True only after verified delivery
   * @returns {string} .delivered_via - Channel that carried the reply (or "hacs_inbox")
   * @returns {string} .error - Failure detail when ok is false
   */
  async replyChannel({ instanceId, channel, thread_id, text } = {}) {
    if (typeof channel !== 'string' || channel.length === 0) {
      return { ok: false, error: 'channel is required' };
    }
    if (thread_id === undefined || thread_id === null || String(thread_id).length === 0) {
      return { ok: false, error: 'thread_id is required for channel replies' };
    }
    if (typeof text !== 'string' || text.length === 0) {
      return { ok: false, error: 'text is required' };
    }

    const driver = this.outbound.get(channel);
    if (!driver) {
      return { ok: false, error: `channel ${channel} has no outbound driver` };
    }

    // Never report sent unless verified all the way down (H-02): the driver's
    // result is returned VERBATIM — the hub adds no optimism. The one §8b
    // exception: verified ok:true missing delivered_via gets stamped with the
    // channel it actually went through (truthful; contract §5).
    try {
      if (typeof driver === 'function') {
        return stampDeliveredVia(await driver({ thread_id: String(thread_id), text }), channel);
      }
      // URL driver: POST {thread_id, text} to the registered callback (contract §7)
      const response = await fetch(driver, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: String(thread_id), text }),
        signal: AbortSignal.timeout(5000)
      });
      const result = await response.json().catch(() => null);
      if (result && typeof result === 'object' && 'ok' in result) {
        return stampDeliveredVia(result, channel);
      }
      if (!response.ok) {
        return { ok: false, error: `channel ${channel} driver returned HTTP ${response.status}` };
      }
      return { ok: false, error: `channel ${channel} driver returned an unparseable response` };
    } catch (err) {
      this._recordError('reply', `${instanceId || '?'}/${channel}: ${err.message}`);
      return { ok: false, error: `channel ${channel} driver unreachable: ${err.message}` };
    }
  }

  // -------------------------------------------------------------------------
  // getStatus() — queryable state for tests/admin (T6d: failures visible)
  // -------------------------------------------------------------------------

  getStatus() {
    const slots = [];
    let pendingDeliveries = 0;
    for (const [instanceId, inst] of this.counters) {
      for (const [channel, senders] of Object.entries(inst)) {
        for (const [from, slot] of Object.entries(senders)) {
          slots.push({ instanceId, channel, from, count: slot.count, status: slot.status, last_ts: slot.last_ts });
          if (slot.status === 'pending') pendingDeliveries += 1;
        }
      }
    }
    return { slots, pendingDeliveries, lastErrors: [...this.lastErrors] };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * Dispatch the thin notification via the chassis adapter. Dynamic import
   * avoids module cycles (adapter may import server-side modules).
   * Notification carries ONLY {channel, from, count, ts, thread_id?} — no body, ever.
   *
   * Convention (contract §8b): deliverNotification RESOLVES only on verified
   * delivery and THROWS on any failure (missing adapter, {ok:false} notify).
   * So 'active' is set strictly after a resolved await; a throw propagates to
   * the caller's .catch (publish → 'pending' + _recordError; _retryPending →
   * slot already 'pending', error recorded).
   */
  async _dispatch(instanceId, channel, from, slot) {
    if (slot._dispatching) return; // one in-flight delivery per slot
    slot._dispatching = true;
    try {
      // Interrupt policy (contract §10): quiet channels accrue counters and
      // are drained on the instance's schedule — no injection is sent, so an
      // idle mind stays asleep. Interrupt channels deliver the notification,
      // which (post meta-shape fix) starts a turn on an idle session.
      const interrupt = await this._resolveInterrupt(instanceId, channel);
      if (!interrupt) {
        slot.status = 'active'; // aware-by-policy: nothing outstanding to deliver
        logger.info(`[EventHub] quiet-policy: ${instanceId} ${channel}/${from} count=${slot.count} (counter only)`);
        this._scheduleSnapshot(instanceId);
        return;
      }
      const notification = { channel, from, count: slot.count, ts: slot.last_ts };
      if (slot.thread_id !== undefined) notification.thread_id = slot.thread_id;
      const chassis = await import('./chassis/index.js');
      await chassis.deliverNotification(instanceId, notification); // throws on failure
      slot.status = 'active'; // verified delivery — notified, unacked, waits for drain
      this._scheduleSnapshot(instanceId);
    } finally {
      slot._dispatching = false;
    }
  }

  /**
   * Resolve the interrupt policy for {instance, channel}:
   *   per-instance prefs (notifications.<channel>.interrupt) → system default.
   * The project-level override (PM/COO enabling interrupt for an active
   * project's members) is tooling that WRITES these prefs via
   * set_notification_policy — resolution here stays two-source and cheap.
   * Prefs are read fresh per 0→active transition (rare) so control-panel
   * edits take effect without a restart. Read failure → defaults (never
   * blocks delivery decisions on a bad prefs file).
   */
  async _resolveInterrupt(instanceId, channel) {
    let prefs = null;
    try { prefs = await readPreferences(instanceId); } catch { /* defaults */ }
    const per = prefs?.notifications?.[channel]?.interrupt;
    if (typeof per === 'boolean') return per;
    return INTERRUPT_DEFAULTS[channel] ?? false;
  }

  /**
   * @hacs-endpoint
   * @template-version 1.0.0
   * ┌─────────────────────────────────────────────────────────────────────────┐
   * │ SET_NOTIFICATION_POLICY                                                 │
   * │ Choose which channels interrupt an instance live vs accrue quietly      │
   * └─────────────────────────────────────────────────────────────────────────┘
   *
   * @tool set_notification_policy
   * @version 1.0.0
   * @since 2026-08-03
   * @category events
   * @status stable
   *
   * Sets the interrupt policy for one channel of one instance. Interrupting
   * channels deliver a live notification that wakes an idle session; quiet
   * channels only accrue counters (read them with drain_events on your own
   * schedule). System defaults: hacs and telegram interrupt, email is quiet.
   * Omit targetInstanceId to set your own policy; setting another instance's
   * policy (the PM/COO project-override path) is audit-logged with your ID.
   *
   * @param {string} instanceId - Your instance ID [required]
   * @param {string} channel - Channel name, e.g. "email", "telegram", "hacs" [required]
   * @param {boolean} interrupt - true = interrupt live, false = quiet counters [required]
   * @param {string} targetInstanceId - Instance to set policy for (default: yourself) [optional]
   *
   * @returns {object} response
   * @returns {boolean} .success
   * @returns {string} .instanceId - Whose policy was set
   * @returns {string} .channel
   * @returns {boolean} .interrupt - The policy now in effect
   * @returns {boolean} .default - What the system default would have been
   */
  async setNotificationPolicy({ instanceId, targetInstanceId, channel, interrupt }) {
    const target = targetInstanceId || instanceId;
    if (!target || typeof target !== 'string' || !SAFE_ID_RE.test(target) || target === '.' || target === '..') {
      return { success: false, error: 'invalid target instanceId' };
    }
    if (!channel || !/^[a-z0-9_-]+$/i.test(channel)) {
      return { success: false, error: 'invalid channel' };
    }
    if (typeof interrupt !== 'boolean') {
      return { success: false, error: 'interrupt must be boolean true|false' };
    }
    let prefs;
    try { prefs = (await readPreferences(target)) || {}; } catch { prefs = {}; }
    prefs.notifications = prefs.notifications || {};
    prefs.notifications[channel] = { ...(prefs.notifications[channel] || {}), interrupt };
    await writePreferences(target, prefs);
    if (target !== instanceId) {
      logger.info(`[EventHub] notification policy for ${target} set by ${instanceId}: ${channel}.interrupt=${interrupt}`);
    }
    return { success: true, instanceId: target, channel, interrupt, default: INTERRUPT_DEFAULTS[channel] ?? false };
  }

  /**
   * Serialize counter-file writes per instance: each write chains behind the
   * previous one so tmp+rename snapshots never interleave (no lost updates).
   * The returned promise NEVER rejects; it resolves {ok:true} on a durable
   * write or {ok:false, error} on failure (logged + recorded) so callers that
   * care (drain) can report honestly while fire-and-forget callers stay safe.
   */
  _scheduleSnapshot(instanceId) {
    const prev = this.writeChains.get(instanceId) || Promise.resolve();
    const next = prev.then(() => this._writeCounterFile(instanceId)).then(
      () => ({ ok: true }),
      (err) => {
        logger.error(`[EventHub] counter snapshot failed for ${instanceId}`, { error: err.message });
        this._recordError('snapshot', `${instanceId}: ${err.message}`);
        return { ok: false, error: err.message };
      }
    );
    this.writeChains.set(instanceId, next);
    return next;
  }

  async _writeCounterFile(instanceId) {
    const inst = this.counters.get(instanceId) || Object.create(null);
    // Clean copy: only contract §3 fields, no _private runtime flags
    const clean = Object.create(null); // §8b: null-prototype, external keys
    for (const [channel, senders] of Object.entries(inst)) {
      for (const [from, slot] of Object.entries(senders)) {
        if (!clean[channel]) clean[channel] = Object.create(null);
        const s = { count: slot.count, status: slot.status, last_ts: slot.last_ts, refs: [...slot.refs] };
        if (slot.thread_id !== undefined) s.thread_id = slot.thread_id;
        if (slot.bidirectional) s.bidirectional = true;
        clean[channel][from] = s;
      }
    }
    await writeJSON(counterFilePath(instanceId), clean); // tmp + rename (atomic)
  }

  /**
   * Lazy synchronous load — keeps publish()'s counter path synchronous even
   * for instances that appeared after initHub()'s scan. Runs once per instance.
   * Corrupt file → rename .corrupt-<epoch>, log, start clean (contract §3).
   */
  _ensureLoadedSync(instanceId) {
    if (this.loaded.has(instanceId)) return;
    this.loaded.add(instanceId);
    const filePath = counterFilePath(instanceId);
    let raw;
    try {
      raw = fssync.readFileSync(filePath, 'utf8');
    } catch {
      return; // no file yet — start empty
    }
    try {
      this.counters.set(instanceId, sanitizeCounterData(JSON.parse(raw)));
    } catch (err) {
      const corruptPath = `${filePath}.corrupt-${nowEpochSeconds()}`;
      try { fssync.renameSync(filePath, corruptPath); } catch { /* best effort */ }
      logger.error(`[EventHub] corrupt counter file for ${instanceId} — quarantined`, {
        renamedTo: corruptPath, error: err.message
      });
      this._recordError('corrupt-file', `${instanceId}: ${err.message}`);
    }
  }

  _recordError(kind, detail) {
    this.lastErrors.push({ kind, detail, ts: nowEpochSeconds() });
    if (this.lastErrors.length > MAX_LAST_ERRORS) {
      this.lastErrors.splice(0, this.lastErrors.length - MAX_LAST_ERRORS);
    }
  }

  /**
   * Retry sweep: re-dispatch pending slots (notify failed earlier, or hub
   * restarted with undelivered notifications). Runs every 60s, unref()'d so
   * it never keeps the process alive.
   */
  _startRetrySweep() {
    if (this._retryTimer) return;
    this._retryTimer = setInterval(() => this._retryPending(), RETRY_SWEEP_MS);
    this._retryTimer.unref();
  }

  _retryPending() {
    for (const [instanceId, inst] of this.counters) {
      for (const [channel, senders] of Object.entries(inst)) {
        for (const [from, slot] of Object.entries(senders)) {
          if (slot.status !== 'pending' || slot.count === 0 || slot._dispatching) continue;
          this._dispatch(instanceId, channel, from, slot).catch((err) => {
            // stays pending; next sweep retries. Recorded, not swallowed.
            this._recordError('retry', `${instanceId}/${channel}/${from}: ${err.message}`);
          });
        }
      }
    }
  }
}

/**
 * Sanitize loaded counter data to the contract §3 slot shape.
 * Garbage entries degrade gracefully instead of poisoning the hub.
 */
function sanitizeCounterData(data) {
  const out = Object.create(null); // §8b: null-prototype — keys come from disk
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const [channel, senders] of Object.entries(data)) {
    if (!senders || typeof senders !== 'object' || Array.isArray(senders)) continue;
    for (const [from, slot] of Object.entries(senders)) {
      if (!slot || typeof slot !== 'object') continue;
      const s = {
        count: Number.isFinite(slot.count) && slot.count > 0 ? Math.floor(slot.count) : 0,
        status: slot.status === 'active' ? 'active' : 'pending',
        last_ts: Number.isFinite(slot.last_ts) ? slot.last_ts : nowEpochSeconds(),
        refs: Array.isArray(slot.refs) ? slot.refs.filter(r => typeof r === 'string').slice(-MAX_REFS) : []
      };
      if (typeof slot.thread_id === 'string' || typeof slot.thread_id === 'number') {
        s.thread_id = String(slot.thread_id);
      }
      if (slot.bidirectional === true) s.bidirectional = true;
      if (!out[channel]) out[channel] = Object.create(null);
      out[channel][from] = s;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Singleton & initialization
// ---------------------------------------------------------------------------

const hub = new EventHub();

/**
 * Initialize the hub. Called from server.js after initBroker().
 * - Wires the broker ref.
 * - Ensures the HTTP-surface secret file exists (mode 0600).
 * - Loads existing counter files (restart survival, contract §9.4).
 * - Re-dispatches undelivered slots and starts the pending-retry sweep.
 */
async function initHub(broker) {
  hub.broker = broker;

  // Secret file for the loopback HTTP surface (contract §2)
  const secretPath = secretFilePath();
  try {
    await fs.access(secretPath);
  } catch {
    await ensureDir(path.dirname(secretPath));
    await fs.writeFile(secretPath, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    logger.info(`[EventHub] generated hub secret at ${secretPath}`);
  }

  // Restart survival: load every existing counter file, then re-dispatch any
  // slot that still has undrained events. Delivery is unconfirmed after a
  // restart, so those slots go 'pending' until the dispatch succeeds.
  let entries = [];
  try {
    entries = await fs.readdir(getInstancesDir(), { withFileTypes: true });
  } catch { /* no instances dir yet — nothing to recover */ }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    hub._ensureLoadedSync(entry.name);
    const inst = hub.counters.get(entry.name);
    if (!inst) continue;
    let dirty = false;
    for (const senders of Object.values(inst)) {
      for (const slot of Object.values(senders)) {
        if ((slot.status === 'active' || slot.status === 'pending') && slot.count > 0) {
          slot.status = 'pending';
          dirty = true;
        }
      }
    }
    if (dirty) hub._scheduleSnapshot(entry.name);
  }
  hub._retryPending(); // immediate re-dispatch pass — no waiting for the first sweep

  hub._startRetrySweep();
  logger.info(`[EventHub] initialized`, {
    instancesLoaded: hub.counters.size,
    pendingDeliveries: hub.getStatus().pendingDeliveries
  });
  return hub;
}

export { EventHub, hub, initHub };
