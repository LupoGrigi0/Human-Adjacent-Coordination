#!/usr/bin/env node
// SAMPLE HACS INPUT DRIVER — the whole pattern in ~40 lines.
// A driver is ANY process that watches a source and publishes THIN events
// (never bodies!) to the hub. This one watches a directory: new file → event.
// Full interface: docs/EVENT-HUB-CONTRACT.md (§1 payload, §2 HTTP, §8 env).

import fs from 'fs';                      // sync API for watch; promises for reads
import path from 'path';

// 1. Configuration comes from the environment (contract §8 names, with the
//    pre-contract names honored as fallbacks) — no code changes to deploy.
//    The watch dir may also be passed as the final CLI argument.
const WATCH_DIR = process.argv[2]
  || process.env.DRIVER_WATCH_DIR || process.env.WATCH_DIR || './watched';
const TARGET = process.env.DRIVER_TARGET_INSTANCE || process.env.TARGET; // instance the events are FOR
const HUB_URL = process.env.HACS_HUB_URL || process.env.HUB_URL
  || 'http://127.0.0.1:3444';   // the hub's HTTP surface (plain-http for this sample)
const SECRET_FILE = process.env.HUB_SECRET_FILE || '/mnt/coordinaton_mcp_data/.hub-secret';

// A target is REQUIRED — never guess a real instance id and spam its counters.
if (!TARGET) {
  console.error('[sample-driver] DRIVER_TARGET_INSTANCE is not set — refusing to start.\n'
    + 'Set DRIVER_TARGET_INSTANCE=<instanceId> (the instance these events are FOR).');
  process.exit(1);
}

// 2. Auth: the hub only accepts loopback requests carrying the shared secret,
//    which lives in a 0600 file the hub creates at startup. Read it once.
const SECRET = fs.readFileSync(SECRET_FILE, 'utf8').trim();

// 3. publish() — the one call every driver makes. POST the payload to
//    /hub/publish with the X-Hub-Secret header. The hub answers {ok, counter}.
async function publish(payload) {
  const res = await fetch(`${HUB_URL}/hub/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Hub-Secret': SECRET },
    body: JSON.stringify(payload)
  });
  const body = await res.json();
  if (!body.ok) console.error(`[sample-driver] hub rejected publish: ${body.error}`);
  return body;
}

// 4. Watch the source. Create the dir if it's missing (a fresh checkout has
//    no ./watched) so fs.watch can't throw at startup; exit cleanly if even
//    that fails (permissions, path is a file, ...) instead of stack-tracing.
try {
  fs.mkdirSync(WATCH_DIR, { recursive: true });
} catch (err) {
  console.error(`[sample-driver] cannot create/access watch dir ${WATCH_DIR}: ${err.message}`);
  process.exit(1);
}
// fs.watch fires on create/rename/change in the dir.
fs.watch(WATCH_DIR, (eventType, filename) => {
  if (!filename) return;
  const filePath = path.join(WATCH_DIR, filename);
  if (!fs.existsSync(filePath)) return;   // deletion events also fire — skip them

  // 5. Publish the THIN event. No body! `ref` is an opaque string the target
  //    instance later uses to fetch the content itself (here: the file path).
  publish({
    target: TARGET,          // REQUIRED — which instance this is for
    channel: 'sample',       // REQUIRED — your channel name (pick anything unique)
    from: 'fs-watcher',      // REQUIRED — human-readable sender label
    ref: filePath            // REQUIRED — how the body is fetched later
  }).catch((err) => console.error(`[sample-driver] publish failed: ${err.message}`));
});

console.log(`[sample-driver] watching ${WATCH_DIR} → ${TARGET} via ${HUB_URL}`);
