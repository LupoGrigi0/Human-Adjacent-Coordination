/**
 * HACS Email Driver — maildir watcher → hub publish
 *
 * Watches <dataRoot>/instances/<id>/mail/new/ for every instance whose
 * .hacs-identity declares chassis === 'claude-code-channel'. On a new
 * message file it parses the From header and publishes a THIN event:
 *   { target: <instanceId>, channel: 'email', from, ref: <absolute path> }
 * The body never leaves the maildir — the instance fetches it via the ref.
 *
 * Reliability model (belt and braces):
 *  - fs.watch gives instant delivery; a 60s rescan catches anything watch
 *    missed (and re-discovers instances that appeared after boot).
 *  - A file is marked "seen" (state/email.json) ONLY after the hub accepted
 *    the publish — a dropped publish is retried by the next rescan.
 *  - Watcher errors (dir deleted, etc.) drop the watcher; discovery re-adds.
 *
 * Contract: docs/EVENT-HUB-CONTRACT.md (§1 publish shape, §8 env)
 * Date:     2026-08-02
 */

import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { createLogger } from '../../logger.js';

const logger = createLogger('email-driver.log');

// Re-scan cadence for new instances + missed files. Env-overridable so tests
// can shrink it (contract §8, EMAIL_DISCOVERY_MS) — mirrors TELEGRAM_DISCOVERY_MS.
const DISCOVERY_INTERVAL_MS = Math.max(1, Number(process.env.EMAIL_DISCOVERY_MS) || 60000);
const HEADER_BYTES = 4096;           // only the first 4KB is read for From:

/**
 * Start the email driver.
 * @param {object} ctx
 * @param {function} ctx.publish  shared publish(payload) → {ok, ...}
 * @param {string}   ctx.dataRoot V2 data root (contains instances/)
 * @param {string}   ctx.stateDir directory for the seen-set state file
 * @returns {Promise<{stop: function}>}
 */
export async function start({ publish, dataRoot, stateDir }) {
  const instancesDir = path.join(dataRoot, 'instances');
  const statePath = path.join(stateDir, 'email.json');

  const seen = new Map();     // absolute path → first-seen epoch seconds
  const watched = new Map();  // instanceId → { dir, watcher }
  const inFlight = new Set(); // paths mid-publish (fs.watch fires duplicates)
  let saveChain = Promise.resolve(); // serializes state writes
  let stopped = false;

  // --- Seen-set state -------------------------------------------------------
  await fs.mkdir(stateDir, { recursive: true }); // host creates it too; be standalone-safe
  try {
    const raw = JSON.parse(await fs.readFile(statePath, 'utf8'));
    for (const [p, ts] of Object.entries(raw)) seen.set(p, ts);
    logger.info(`[email-driver] loaded seen-set: ${seen.size} entries`);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.warn('[email-driver] seen-set unreadable — starting clean (may re-notify)', {
        path: statePath, error: err.message
      });
    }
  }

  function saveState() {
    // tmp + rename so a crash never leaves a torn file; chained so writes
    // from overlapping events can't interleave.
    saveChain = saveChain.then(async () => {
      const tmp = `${statePath}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(Object.fromEntries(seen), null, 2));
      await fs.rename(tmp, statePath);
    }).catch((err) => {
      logger.error('[email-driver] seen-set write failed', { error: err.message });
    });
    return saveChain;
  }

  // --- From-header parsing --------------------------------------------------
  async function parseFrom(filePath) {
    let fh;
    try {
      fh = await fs.open(filePath, 'r');
      const buf = Buffer.alloc(HEADER_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HEADER_BYTES, 0);
      const head = buf.toString('utf8', 0, bytesRead);
      const m = head.match(/^From:\s*(.*)$/m);
      if (!m) return 'unknown';
      const raw = m[1].trim();
      const angle = raw.match(/<([^>]+)>/); // "Paula X <paula@x.com>" → paula@x.com
      const from = (angle ? angle[1] : raw).trim();
      return from || 'unknown';
    } catch (err) {
      logger.warn('[email-driver] header read failed — publishing as unknown', {
        path: filePath, error: err.message
      });
      return 'unknown';
    } finally {
      if (fh) await fh.close().catch(() => {});
    }
  }

  // --- New-file handling ----------------------------------------------------
  async function handleNewFile(instanceId, filePath) {
    if (stopped || seen.has(filePath) || inFlight.has(filePath)) return;
    inFlight.add(filePath);
    try {
      const st = await fs.stat(filePath).catch(() => null);
      if (!st || !st.isFile()) return; // vanished or not a message file

      const from = await parseFrom(filePath);
      const result = await publish({
        target: instanceId,
        channel: 'email',
        from,
        ref: filePath
      });
      if (result?.ok) {
        // Only now is it "seen" — a dropped publish stays eligible for rescan.
        seen.set(filePath, Math.floor(Date.now() / 1000));
        await saveState();
        logger.info(`[email-driver] published: ${instanceId} ← ${from}`, { ref: filePath });
      } else {
        logger.error('[email-driver] publish failed — 60s rescan will retry', {
          target: instanceId, from, ref: filePath, error: result?.error
        });
      }
    } finally {
      inFlight.delete(filePath);
    }
  }

  // --- Rescan (startup + 60s belt for missed fs.watch events) ---------------
  async function rescan(instanceId, dir) {
    let names;
    try {
      names = await fs.readdir(dir);
    } catch (err) {
      // Dir gone — drop the watcher; discovery re-adds it if it comes back.
      logger.warn(`[email-driver] mail dir unreadable — dropping watcher: ${instanceId}`, {
        dir, error: err.message
      });
      dropWatcher(instanceId);
      return;
    }
    const current = new Set(names.map((n) => path.join(dir, n)));

    // Prune seen entries whose files left new/ (delivered → cur/, or deleted).
    // The readdir snapshot above can be stale: a file that arrived (and was
    // published by fs.watch) mid-rescan is missing from `current` but very
    // much still on disk — pruning it would re-publish it next sweep. So a
    // seen entry is only pruned after a FRESH fs.stat confirms the file is
    // actually gone (ENOENT).
    let pruned = false;
    const prefix = dir + path.sep;
    for (const p of [...seen.keys()]) {
      if (!p.startsWith(prefix) || current.has(p)) continue;
      const gone = await fs.stat(p).then(
        () => false,
        (err) => err.code === 'ENOENT'
      );
      if (gone) { seen.delete(p); pruned = true; }
    }
    if (pruned) await saveState();

    for (const p of current) {
      if (!seen.has(p)) await handleNewFile(instanceId, p);
    }
  }

  // --- Watchers -------------------------------------------------------------
  function dropWatcher(instanceId) {
    const entry = watched.get(instanceId);
    if (!entry) return;
    try { entry.watcher.close(); } catch { /* already dead */ }
    watched.delete(instanceId);
  }

  function attachWatcher(instanceId, dir) {
    let watcher;
    try {
      watcher = fssync.watch(dir, (eventType, filename) => {
        if (!filename) return;
        handleNewFile(instanceId, path.join(dir, filename)).catch((err) => {
          logger.error('[email-driver] watch handler error', { error: err.message });
        });
      });
    } catch (err) {
      logger.warn(`[email-driver] fs.watch failed (rescan still covers): ${instanceId}`, {
        dir, error: err.message
      });
      return;
    }
    watcher.on('error', (err) => {
      logger.warn(`[email-driver] watcher error — dropping (discovery re-adds): ${instanceId}`, {
        dir, error: err.message
      });
      dropWatcher(instanceId);
    });
    watched.set(instanceId, { dir, watcher });
  }

  // --- Discovery: which instances get an email watch ------------------------
  async function discover() {
    let ids = [];
    try {
      ids = (await fs.readdir(instancesDir, { withFileTypes: true }))
        .filter((d) => d.isDirectory()).map((d) => d.name);
    } catch (err) {
      logger.error('[email-driver] instances dir unreadable', { dir: instancesDir, error: err.message });
      return;
    }

    const qualifying = new Set();
    for (const id of ids) {
      try {
        const identity = JSON.parse(
          await fs.readFile(path.join(instancesDir, id, '.hacs-identity'), 'utf8'));
        if (identity?.chassis !== 'claude-code-channel') continue;
        const mailNew = path.join(instancesDir, id, 'mail', 'new');
        if (!(await fs.stat(mailNew).catch(() => null))?.isDirectory()) continue;
        qualifying.add(id);
        if (!watched.has(id)) {
          logger.info(`[email-driver] watching: ${id}`, { dir: mailNew });
          await rescan(id, mailNew);   // catch mail that landed before this boot
          attachWatcher(id, mailNew);  // then go live
        }
      } catch { /* no identity file / not JSON → not a watch target */ }
    }

    // Instances that stopped qualifying (chassis changed, dir removed).
    for (const id of [...watched.keys()]) {
      if (!qualifying.has(id)) {
        logger.info(`[email-driver] unwatching: ${id}`);
        dropWatcher(id);
      }
    }
  }

  await discover(); // startup: discovery includes the initial rescan per target

  const timer = setInterval(async () => {
    try {
      await discover();
      for (const [id, { dir }] of [...watched]) await rescan(id, dir);
    } catch (err) {
      logger.error('[email-driver] periodic sweep error', { error: err.message });
    }
  }, DISCOVERY_INTERVAL_MS);
  timer.unref?.();

  logger.info(`[email-driver] started — ${watched.size} target(s) watched`);

  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      for (const id of [...watched.keys()]) dropWatcher(id);
      await saveChain; // let the last state write land
      logger.info('[email-driver] stopped');
    }
  };
}
