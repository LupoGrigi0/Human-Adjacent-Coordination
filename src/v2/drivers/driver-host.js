/**
 * HACS Driver Host — one process that runs the bundled input drivers
 *
 * Drivers are small adapters that watch a source (maildir, telegram bot, ...)
 * and publish thin events to the hub over its HTTP surface. This host wires
 * env config, the shared publish() (with retry), and clean shutdown, then
 * hands control to the driver modules. Third parties do NOT need this file —
 * see sample-driver/ for the standalone pattern.
 *
 * Contract: docs/EVENT-HUB-CONTRACT.md (§1 publish shape, §2 HTTP, §8 env)
 * Spec:     Messenger-Event-Hub-Spec.md (Crossing-2d23)
 * Date:     2026-08-02
 */

import fs from 'fs/promises';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../../logger.js';

const logger = createLogger('driver-host.log');

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// --- Env (contract §8) ------------------------------------------------------
// Production serves HTTPS (self-signed) on 3444 — https is the default; a
// plain-http URL (tests, local hub) is honored as-is.
const HUB_URL = process.env.HACS_HUB_URL || 'https://127.0.0.1:3444';
const SECRET_FILE = process.env.HUB_SECRET_FILE || '/mnt/coordinaton_mcp_data/.hub-secret';
const DATA_ROOT = process.env.V2_DATA_ROOT || '/mnt/coordinaton_mcp_data/';
const STATE_DIR = process.env.DRIVER_STATE_DIR || path.join(SCRIPT_DIR, 'state/');
const TELEGRAM_API_BASE = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';
const OUTBOUND_PORT = parseInt(process.env.DRIVER_OUTBOUND_PORT || '21097', 10);

// --- Hub secret -------------------------------------------------------------
// The hub generates the secret file at ITS startup; if we boot first, the
// read fails now and is retried on every publish attempt until it appears.
let hubSecret = null;

async function readSecret() {
  if (hubSecret) return hubSecret;
  hubSecret = (await fs.readFile(SECRET_FILE, 'utf8')).trim();
  return hubSecret;
}

// --- Hub HTTP transport -----------------------------------------------------
// The hub's self-signed cert is accepted for https://127.0.0.1 ONLY (contract
// §8): a dedicated https.Agent with rejectUnauthorized:false is attached to
// those requests and nothing else — never a process-wide TLS override. Plain
// http URLs and https to any other host use default verification.
const loopbackInsecureAgent = new https.Agent({ rejectUnauthorized: false });

function agentFor(u) {
  // Loopback in BOTH families: the hub binds [::1]:3444. NOTE: on Node 20,
  // new URL('https://[::1]:...').hostname KEEPS the brackets ('[::1]') — verified
  // empirically against this deployment — so the bracketed form is the one that
  // actually matches; bare '::1' kept for safety. Self-signed-cert acceptance
  // stays strictly loopback-only (api.telegram.org etc. keep full verification).
  if (u.protocol === 'https:' && (u.hostname === '127.0.0.1' || u.hostname === '::1' || u.hostname === '[::1]' || u.hostname === 'localhost')) return loopbackInsecureAgent;
  return undefined; // per-protocol default agent, full cert verification
}

const PROTOCOL_MISMATCH_RE = /ECONNRESET|socket hang up|EPROTO|wrong version number|packet length too long|SSL routines/i;

// hubRequest(pathname, {method, headers, body, timeoutMs}) → {status, ok, json}
// Built on node:http(s).request because Node's fetch offers no per-call TLS
// escape hatch that is stable across versions.
function hubRequest(pathname, { method = 'GET', headers = {}, body = null, timeoutMs = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(pathname, HUB_URL); } catch (err) { return reject(err); }
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method, headers, agent: agentFor(u) }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* non-JSON reply */ }
        resolve({
          status: res.statusCode,
          ok: res.statusCode >= 200 && res.statusCode < 300,
          json
        });
      });
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout after ${timeoutMs}ms`)));
    req.on('error', reject);
    req.end(body);
  });
}

function hintProtocolMismatch(errMessage) {
  if (PROTOCOL_MISMATCH_RE.test(errMessage || '')) {
    logger.error(
      `[driver-host] PROTOCOL MISMATCH? "${errMessage}" talking to ${HUB_URL} — ` +
      'hub is probably HTTPS/HTTP — check HACS_HUB_URL'
    );
  }
}

// --- Shared publish() -------------------------------------------------------
// POSTs the payload to <HUB_URL>/hub/publish with X-Hub-Secret. Retries with
// backoff (3 attempts total), then DROPS with a loud log — recovery comes from
// the drivers themselves (email 60s rescan, telegram offset replay), not from
// an unbounded queue here.
const RETRY_DELAYS_MS = [1000, 4000]; // waits before attempt 2 and 3

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function publish(payload) {
  let lastError = 'unknown';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const secret = await readSecret();
      const res = await hubRequest('/hub/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Hub-Secret': secret },
        body: JSON.stringify(payload),
        timeoutMs: 5000
      });
      const body = res.json;
      if (res.ok && body?.ok) return body; // {ok:true, counter}
      // 400 = payload the hub will never accept — retrying is pointless.
      if (res.status === 400) {
        logger.error('[driver-host] publish REJECTED by hub (not retried)', { payload, body });
        return body || { ok: false, error: `http ${res.status}` };
      }
      // 403 usually means the secret rotated under us — force a re-read.
      if (res.status === 403) hubSecret = null;
      lastError = body?.error || `http ${res.status}`;
    } catch (err) {
      lastError = err.message;
      hintProtocolMismatch(lastError);
    }
    if (attempt < 3) await sleep(RETRY_DELAYS_MS[attempt - 1]);
  }
  logger.error('[driver-host] publish DROPPED after 3 attempts — driver rescan must recover it', {
    error: lastError,
    target: payload?.target, channel: payload?.channel, from: payload?.from, ref: payload?.ref
  });
  return { ok: false, error: lastError };
}

// --- Driver loading ---------------------------------------------------------
// Each driver module exports start(ctx) and (optionally) returns {stop}.
// A driver that is missing or throws at startup is a LOUD log, never fatal:
// this host must run standalone even before all drivers exist on disk.
const running = []; // { name, stop }

async function startDriver(name, specifier, ctx) {
  try {
    const mod = await import(specifier);
    if (typeof mod.start !== 'function') throw new Error('module has no start() export');
    const handle = await mod.start(ctx);
    running.push({ name, stop: handle?.stop });
    logger.info(`[driver-host] driver started: ${name}`);
  } catch (err) {
    logger.error(`[driver-host] driver FAILED to start (continuing without it): ${name}`, {
      error: err.message
    });
  }
}

async function main() {
  await fs.mkdir(STATE_DIR, { recursive: true });
  logger.info('[driver-host] starting', {
    hubUrl: HUB_URL, dataRoot: DATA_ROOT, stateDir: STATE_DIR, outboundPort: OUTBOUND_PORT
  });

  // Warm the secret so misconfiguration is visible at boot, not first event.
  try { await readSecret(); } catch (err) {
    logger.warn('[driver-host] hub secret not readable yet (will retry per publish)', {
      file: SECRET_FILE, error: err.message
    });
  }

  // Startup probe: one GET to <hub>/health so an http/https mixup is a loud,
  // immediate boot-time message instead of a confusing first-publish failure.
  // Non-fatal — the hub may simply not be up yet.
  try {
    const probe = await hubRequest('/health', { timeoutMs: 5000 });
    logger.info('[driver-host] hub probe ok', { hubUrl: HUB_URL, status: probe.status });
  } catch (err) {
    hintProtocolMismatch(err.message);
    logger.warn('[driver-host] hub probe failed (publishes will retry)', {
      hubUrl: HUB_URL, error: err.message
    });
  }

  const ctx = {
    publish,
    dataRoot: DATA_ROOT,
    stateDir: STATE_DIR,
    // Extras the telegram driver needs (harmless to others):
    apiBase: TELEGRAM_API_BASE,
    outboundPort: OUTBOUND_PORT,
    hubUrl: HUB_URL,
    secretFile: SECRET_FILE,
    // Shared hub transport: handles the self-signed loopback TLS case that a
    // bare fetch cannot (contract §8 HACS_HUB_URL note). Drivers should use
    // this for ALL hub calls instead of fetch.
    hubRequest
  };

  await startDriver('email', './email-driver.js', ctx);
  await startDriver('telegram', './telegram-driver.js', ctx);

  if (running.length === 0) {
    logger.error('[driver-host] NO drivers running — host is idle but staying up for restart-free recovery');
  }
}

// --- Shutdown ---------------------------------------------------------------
async function shutdown(signal) {
  logger.info(`[driver-host] ${signal} received — stopping drivers`);
  for (const d of running) {
    try { if (d.stop) await d.stop(); } catch (err) {
      logger.warn(`[driver-host] driver stop failed: ${d.name}`, { error: err.message });
    }
  }
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((err) => {
  logger.error('[driver-host] fatal during startup', { error: err.message });
  process.exit(1);
});
