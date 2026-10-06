/**
 * HACS Telegram Driver — BIDIRECTIONAL: long-poll inbound → hub publish,
 * plus the outbound leg (hub reply → sendMessage).
 *
 * Loaded by driver-host.js as:
 *   start({ publish, dataRoot, stateDir, apiBase, outboundPort, hubUrl, secretFile })
 *
 * Inbound: for every instance whose .hacs-identity declares
 * chassis === 'claude-code-channel' AND that has a TELEGRAM_BOT_TOKEN in
 * <instanceDir>/openfang/.env (fallback <instanceDir>/.env), run a getUpdates
 * long-poll loop. Each message publishes a THIN event — never the body:
 *   { target, channel:'telegram', from:'<first_name>(tg)',
 *     ref:'tg:<chat_id>:<message_id>', bidirectional:true, thread_id:'<chat_id>' }
 *
 * Double-poll guard: OpenFang binaries poll the same bots. We only poll a
 * bot when `systemctl is-active openfang@<id>` is NOT 'active' (systemctl
 * absent ⇒ allow). If Telegram answers 409 anyway, another consumer owns the
 * bot — we log LOUDLY and stop that bot's loop for this process lifetime.
 *
 * Outbound: a loopback-only HTTP listener on 127.0.0.1:<outboundPort>.
 * The hub POSTs {thread_id, text} to /outbound (re-registered on EVERY
 * discovery tick via POST <hubUrl>/hub/register-driver — the hub registry is
 * memory-only, §8b). thread_id → bot is resolved from a
 * chat_id→instance map learned from inbound and persisted with the offsets
 * (<stateDir>/telegram-<instanceId>.json). Per H-02 we answer {ok:true}
 * ONLY on HTTP 200 AND body.ok === true from Telegram — every layer checked.
 *
 * Shutdown: driver-host owns SIGTERM and awaits our stop(), which halts the
 * poll loops, closes the listener, and flushes the last state write.
 *
 * Contract: docs/EVENT-HUB-CONTRACT.md (§1 publish, §7 callback, §8 env)
 * Date:     2026-08-02
 */

import fs from 'fs/promises';
import http from 'http';
import path from 'path';
import { execSync } from 'child_process';
import { createLogger } from '../../logger.js';

const logger = createLogger('telegram-driver.log');

// Contract §8: tests shrink the discovery cadence via TELEGRAM_DISCOVERY_MS.
const DISCOVERY_INTERVAL_MS = Math.max(1, Number(process.env.TELEGRAM_DISCOVERY_MS) || 60000);
const POLL_TIMEOUT_S = 25;           // Telegram-side long-poll hold
const FETCH_TIMEOUT_MS = 35000;      // client cap: poll hold + network margin
const MAX_BACKOFF_MS = 60000;        // network-error backoff ceiling
const SAFE_ID = /^[A-Za-z0-9._-]+$/; // instance ids we'll pass to a shell

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True when the OpenFang unit for this instance is actively polling the bot. */
function openfangActive(instanceId) {
  try {
    const out = execSync(`systemctl is-active openfang@${instanceId}`, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
    return out.trim() === 'active';
  } catch {
    return false; // non-zero exit (inactive/failed) or systemctl absent ⇒ allow
  }
}

/**
 * Start the telegram driver.
 * @param {object} ctx
 * @param {function} ctx.publish      shared publish(payload) → {ok, ...}
 * @param {string}   ctx.dataRoot     V2 data root (contains instances/)
 * @param {string}   ctx.stateDir     directory for offset/chat-map state files
 * @param {string}   ctx.apiBase      Telegram API base (TELEGRAM_API_BASE)
 * @param {number}   ctx.outboundPort loopback port for the hub's reply callback
 * @param {string}   ctx.hubUrl       hub base URL (for register-driver)
 * @param {string}   ctx.secretFile   path to the shared X-Hub-Secret file
 * @returns {Promise<{stop: function}>}
 */
export async function start({ publish, dataRoot, stateDir, apiBase, outboundPort, hubUrl, secretFile, hubRequest }) {
  const instancesDir = path.join(dataRoot, 'instances');

  const bots = new Map();           // instanceId → {token, offset, chats:Set, active}
  const banned = new Set();         // instanceIds 409'd — dead for this process lifetime
  const chatToInstance = new Map(); // chat_id string → instanceId
  let saveChain = Promise.resolve();
  let stopped = false;

  // --- State: offsets + learned chat map, one file per instance -------------
  const statePath = (id) => path.join(stateDir, `telegram-${id}.json`);

  async function loadState(id) {
    try {
      const raw = JSON.parse(await fs.readFile(statePath(id), 'utf8'));
      return { offset: Number(raw.offset) || 0, chats: (raw.chats || []).map(String) };
    } catch {
      return { offset: 0, chats: [] }; // first boot / unreadable → replay is safe
    }
  }

  function saveState(id) {
    const bot = bots.get(id);
    if (!bot) return saveChain;
    const snapshot = { offset: bot.offset, chats: [...bot.chats] };
    // tmp + rename so a crash never leaves a torn file; chained so writes
    // from overlapping batches can't interleave.
    saveChain = saveChain.then(async () => {
      const tmp = `${statePath(id)}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2));
      await fs.rename(tmp, statePath(id));
    }).catch((err) => {
      logger.error('[telegram-driver] state write failed', { id, error: err.message });
    });
    return saveChain;
  }

  // --- Token discovery ------------------------------------------------------
  async function readToken(instanceDir) {
    for (const envPath of [path.join(instanceDir, 'openfang', '.env'), path.join(instanceDir, '.env')]) {
      try {
        const m = (await fs.readFile(envPath, 'utf8')).match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.+)\s*$/m);
        if (m) {
          const token = m[1].trim().replace(/^["']|["']$/g, '');
          if (token) return token;
        }
      } catch { /* file missing — try the fallback */ }
    }
    return null;
  }

  // --- Body store (read_message's telegram resolver reads this) -------------
  // instances/<id>/telegram/inbox.jsonl — one JSON line per inbound message:
  // {ref, ts, from, chat_id, text, media?: [{kind, file_id, size?}]}.
  // Rotation: at ~5MB the file moves to inbox.jsonl.1 (one generation kept);
  // the read path scans both. Text-only — binaries never enter this file.
  async function persistBody(id, ref, msg) {
    try {
      const dir = path.join(dataRoot, 'instances', id, 'telegram');
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, 'inbox.jsonl');
      try {
        const st = await fs.stat(file);
        if (st.size > 5 * 1024 * 1024) await fs.rename(file, `${file}.1`);
      } catch { /* no file yet */ }
      const media = [];
      if (msg.photo?.length) {
        const p = msg.photo[msg.photo.length - 1]; // largest rendition
        media.push({ kind: 'image', file_id: p.file_id, size: p.file_size });
      }
      if (msg.voice) media.push({ kind: 'voice', file_id: msg.voice.file_id, size: msg.voice.file_size });
      if (msg.audio) media.push({ kind: 'audio', file_id: msg.audio.file_id, size: msg.audio.file_size });
      if (msg.video) media.push({ kind: 'video', file_id: msg.video.file_id, size: msg.video.file_size });
      if (msg.document) media.push({ kind: 'document', file_id: msg.document.file_id, size: msg.document.file_size, name: msg.document.file_name });
      const line = {
        ref,
        ts: msg.date || Math.floor(Date.now() / 1000),
        from: `${msg.from?.first_name || 'unknown'}(tg)`,
        chat_id: String(msg.chat.id),
        text: msg.text || msg.caption || ''
      };
      if (media.length) line.media = media;
      await fs.appendFile(file, JSON.stringify(line) + '\n');
    } catch (err) {
      // Never let the store break the notification path — the bell outranks
      // the letter. Logged; the body is simply unavailable to read_message.
      logger.error('[telegram-driver] body persist failed', { id, ref, error: err.message });
    }
  }

  // --- Inbound: per-bot long-poll loop --------------------------------------
  async function processBatch(id, bot, updates) {
    for (const u of updates) {
      if (!u?.message?.chat?.id) {
        // Poison / non-message update: consume it so one malformed payload
        // can never wedge this bot's loop in a replay-forever cycle.
        logger.warn('[telegram-driver] skipping update without message.chat.id', {
          id, update_id: u?.update_id
        });
        if (typeof u?.update_id === 'number') bot.offset = u.update_id + 1;
        await saveState(id);
        continue;
      }
      const msg = u.message;
      const chatId = String(msg.chat.id);
      // Persist the BODY before publishing (the letter-opener's store —
      // read_message resolves tg: refs against this file). Before, not
      // after: a publish failure replays the update and the re-write is
      // idempotent by ref. Media is recorded as kind+file_id descriptors
      // (Telegram's getFile can fetch them later — phase-2 conversion
      // scripts' hook); bodies stay text-only here, never binaries.
      await persistBody(id, `tg:${chatId}:${msg.message_id}`, msg);
      const result = await publish({
        target: id,
        channel: 'telegram',
        from: `${msg.from?.first_name || 'unknown'}(tg)`,
        ref: `tg:${chatId}:${msg.message_id}`,
        bidirectional: true,
        thread_id: chatId
      });
      if (!result?.ok) {
        // Don't consume this update — leaving the offset behind it makes
        // the next getUpdates replay it (the driver-side recovery path).
        logger.error('[telegram-driver] publish failed — offset held for replay', {
          id, ref: `tg:${chatId}:${msg.message_id}`, error: result?.error
        });
        return false;
      }
      bot.chats.add(chatId);
      chatToInstance.set(chatId, id);
      bot.offset = u.update_id + 1; // consume only after publish OK
      // Persist per published update — a crash after publish but before a
      // batch-level save would otherwise replay (duplicate-count) on restart.
      await saveState(id);
    }
    return true;
  }

  async function pollLoop(id, bot) {
    let backoff = 1000;
    while (!stopped && bot.active) {
      try {
        const res = await fetch(
          `${apiBase}/bot${bot.token}/getUpdates?timeout=${POLL_TIMEOUT_S}&offset=${bot.offset}`,
          { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (res.status === 409) {
          logger.error(`[telegram-driver] 409 CONFLICT for ${id} — another consumer owns this bot ` +
            '(OpenFang or a second driver?) — backing off for session; loop is DEAD until restart');
          banned.add(id);
          bot.active = false;
          return;
        }
        const body = await res.json().catch(() => null);
        if (!res.ok || body?.ok !== true) throw new Error(`getUpdates http ${res.status}: ${body?.description || 'bad body'}`);
        const clean = await processBatch(id, bot, body.result || []); // persists per update
        if (!clean) throw new Error('publish failure mid-batch');
        backoff = 1000; // healthy pass resets the backoff ladder
      } catch (err) {
        if (stopped || !bot.active) return;
        logger.warn(`[telegram-driver] poll error for ${id} — retry in ${backoff}ms`, { error: err.message });
        await sleep(backoff);
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
    }
  }

  // --- Discovery: which bots we poll ----------------------------------------
  let discovering = false;
  async function discover() {
    if (discovering) return; // overlapping timers must never double-poll a bot
    discovering = true;
    try {
      await discoverOnce();
    } finally {
      discovering = false;
    }
  }

  async function discoverOnce() {
    // Hub registry is memory-only: a hub restart forgets us. Re-register on
    // every tick — idempotent POST, last writer wins (contract §2, §8b).
    await registerWithHub();

    let ids = [];
    try {
      ids = (await fs.readdir(instancesDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory() && SAFE_ID.test(d.name)).map((d) => d.name);
    } catch (err) {
      logger.error('[telegram-driver] instances dir unreadable', { dir: instancesDir, error: err.message });
      return;
    }

    const qualifying = new Set();
    for (const id of ids) {
      try {
        const identity = JSON.parse(
          await fs.readFile(path.join(instancesDir, id, '.hacs-identity'), 'utf8'));
        if (identity?.chassis !== 'claude-code-channel') continue;
        const token = await readToken(path.join(instancesDir, id));
        if (!token) continue;
        if (banned.has(id)) continue;          // 409'd — dead for this process
        if (openfangActive(id)) {              // double-poll guard
          if (bots.has(id)) logger.info(`[telegram-driver] openfang@${id} now active — yielding the bot`);
          continue;
        }
        qualifying.add(id);
        const existing = bots.get(id);
        if (existing) {
          existing.token = token;              // token rotation picked up live
        } else {
          const { offset, chats } = await loadState(id);
          if (bots.has(id)) continue; // re-check after await — never spawn a second loop
          const bot = { token, offset, chats: new Set(chats), active: true };
          for (const c of chats) chatToInstance.set(c, id);
          bots.set(id, bot);
          logger.info(`[telegram-driver] polling bot for ${id}`, { offset });
          pollLoop(id, bot).catch((err) =>
            logger.error(`[telegram-driver] poll loop died for ${id}`, { error: err.message }));
        }
      } catch { /* no identity file / not JSON → not a poll target */ }
    }

    // Stopped qualifying (chassis changed, token gone, openfang took over).
    for (const [id, bot] of [...bots]) {
      if (!qualifying.has(id)) {
        bot.active = false; // loop exits after its in-flight poll returns
        bots.delete(id);    // no bot ⇒ outbound for its chats answers 'unknown thread_id'
      }
    }
  }

  // --- Outbound leg: hub callback listener ----------------------------------
  async function sendReply(threadId, text) {
    const id = chatToInstance.get(String(threadId));
    const token = id && bots.get(id)?.token;
    if (!token) return { ok: false, error: 'unknown thread_id (no bot mapping)' };
    try {
      const res = await fetch(`${apiBase}/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: String(threadId), text }),
        signal: AbortSignal.timeout(10000)
      });
      const body = await res.json().catch(() => null);
      // H-02: "it returned 200" is not "it was delivered" — Telegram's own
      // ok flag must ALSO be true before we ever report success upward.
      if (res.status === 200 && body?.ok === true) return { ok: true, delivered_via: 'telegram' };
      return { ok: false, error: `telegram: ${res.status} ${body?.description || 'no description'}` };
    } catch (err) {
      return { ok: false, error: `telegram: ${err.message}` };
    }
  }

  const server = http.createServer((req, res) => {
    const answer = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    if (req.method !== 'POST' || req.url !== '/outbound') return answer(404, { ok: false, error: 'not found' });
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      let payload;
      try { payload = JSON.parse(raw); } catch { return answer(400, { ok: false, error: 'invalid JSON' }); }
      if (!payload?.thread_id || typeof payload.text !== 'string') {
        return answer(400, { ok: false, error: 'thread_id and text are required' });
      }
      const result = await sendReply(payload.thread_id, payload.text);
      if (!result.ok) logger.warn('[telegram-driver] outbound send failed', { thread_id: payload.thread_id, error: result.error });
      answer(200, result);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(outboundPort, '127.0.0.1', resolve);
  });

  // --- Hub registration -----------------------------------------------------
  // Called from EVERY discovery tick (not one-shot): the hub's outbound
  // registry is memory-only, so a hub restart would orphan this channel.
  // Idempotent POST — last writer wins (contract §2). One attempt per tick;
  // the next tick is the retry.
  let registeredLogged = false;
  async function registerWithHub() {
    try {
      const secret = (await fs.readFile(secretFile, 'utf8')).trim();
      const payload = JSON.stringify({ channel: 'telegram', callback_url: `http://127.0.0.1:${outboundPort}/outbound` });
      let ok, body;
      if (hubRequest) {
        // Preferred: driver-host's shared transport (handles self-signed
        // loopback TLS on the https hub — bare fetch cannot).
        const res = await hubRequest('/hub/register-driver', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Hub-Secret': secret },
          body: payload,
          timeoutMs: 5000
        });
        ok = res.ok; body = res.json;
      } else {
        // Standalone fallback (plain-http hub only).
        const res = await fetch(`${hubUrl}/hub/register-driver`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Hub-Secret': secret },
          body: payload,
          signal: AbortSignal.timeout(5000)
        });
        ok = res.ok; body = await res.json().catch(() => null);
      }
      if (!ok || !body?.ok) throw new Error(body?.error || 'register-driver rejected');
      if (!registeredLogged) {
        logger.info('[telegram-driver] registered outbound callback with hub');
        registeredLogged = true;
      }
    } catch (err) {
      registeredLogged = false; // log again once the hub comes back
      logger.warn('[telegram-driver] hub registration failed — will retry next discovery tick', { error: err.message });
    }
  }

  await discover();
  const timer = setInterval(() => discover().catch((err) =>
    logger.error('[telegram-driver] discovery error', { error: err.message })), DISCOVERY_INTERVAL_MS);
  timer.unref?.();

  logger.info(`[telegram-driver] started — ${bots.size} bot(s) polling, outbound on 127.0.0.1:${outboundPort}`);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      for (const bot of bots.values()) bot.active = false;
      await new Promise((r) => server.close(r));
      await saveChain; // let the last offset write land
      logger.info('[telegram-driver] stopped');
    }
  };
}
