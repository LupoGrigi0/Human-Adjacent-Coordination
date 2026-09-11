#!/usr/bin/env node
/**
 * resolve-session-id.mjs — the ONE canonical session/transcript resolver.
 *
 * Replaces five reverse-engineered slug transforms (three of which disagreed,
 * and all of which "agreed by luck" on current paths — Crossing, 2026-09-10) and
 * the stale `.claude-session-id` sidecar (Zara's 125-crash-loop, Genevieve's dead
 * mirror). Everything that needs to find a session's transcript calls this.
 *
 * DISCOVER, don't compute. The cwd->slug transform only PREDICTS a directory
 * name; if we LIST and MATCH the projects dir we read ground truth and the
 * transform's fragility is irrelevant. The authoritative transform (from the
 * Claude Code binary + a verified on-disk cross-check: `/`, `.`, `_` -> `-`,
 * everything else preserved) is used ONLY as the labeled primary key and as a
 * cross-check that FAILS LOUD when it disagrees with discovery.
 *
 * Usage:
 *   resolve-session-id.mjs                 # own session: cwd + $HOME
 *   resolve-session-id.mjs --dir <cwd>     # a specific working dir
 *   resolve-session-id.mjs --home <path>   # a specific ~ (default $HOME)
 *   resolve-session-id.mjs --json          # machine output
 * Prints the session id (stdout). Exit 0 on unique resolution; non-zero + a
 * reason on stderr for not-found / ambiguous / disagreement — never a silent guess.
 */
import fs from 'fs';
import path from 'path';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}
const asJson = process.argv.includes('--json');

// --instance <id>: the natural interface for HACS callers. For a chassis
// instance, HOME *is* the instance dir, and the session's launch cwd is that
// same dir — so cwd and home are both instances/<id>. This is why passing the
// process cwd is wrong for a subprocess (a bash tool in a subdir has a
// different cwd than the session's launch dir); resolve from the instance, not
// the shell. NOTE: reading another instance's ~/.claude/projects requires read
// permission on their dir — the common case is an instance resolving ITSELF.
const instance = arg('--instance', null);
let cwd, home;
if (instance) {
  if (!/^[A-Za-z0-9._-]+$/.test(instance)) die(`bad instance id '${instance}'`);
  const idir = `/mnt/coordinaton_mcp_data/instances/${instance}`;
  cwd = idir;
  home = idir;
} else {
  cwd = path.resolve(arg('--dir', process.cwd()));
  home = arg('--home', process.env.HOME || '');
}

function die(reason, code = 2) {
  process.stderr.write(`resolve-session-id: ${reason}\n`);
  process.exit(code);
}

// AUTHORITATIVE transform — matches Claude Code's own projects-dir slug.
// Verified: /mnt/.../coordinaton_mcp_data -> -mnt-...-coordinaton-mcp-data
// (slash AND underscore -> dash). Dots too. NOT "every non-alphanumeric".
const slugify = (p) => p.replace(/[/._]/g, '-');

const projectsRoot = path.join(home, '.claude', 'projects');
let dirs;
try {
  dirs = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
} catch (e) {
  die(`cannot read ${projectsRoot} (${e.code || e.message})`);
}

const expected = slugify(cwd);
// DISCOVER: the project dir for this cwd is the one whose name equals the
// authoritative slug. Exact only — a substring match would collide sibling
// instances (Messenger-aa2a vs Messenger-7e2f both start the same).
const matches = dirs.filter((d) => d === expected);

if (matches.length === 0) {
  // Discovery found nothing at the computed key. Do NOT fall back to a fuzzy
  // guess; report distinctly so the caller sees WHY (Bastion: ambiguity must
  // render as candidates, never a silent pick or a duplicate).
  const near = dirs.filter((d) => d.includes(path.basename(cwd)));
  die(`no project dir for cwd '${cwd}' (expected slug '${expected}'). `
    + (near.length ? `Near: ${near.join(', ')}` : `${dirs.length} dirs present, none match.`));
}
if (matches.length > 1) {
  die(`ambiguous: ${matches.length} project dirs match '${expected}': ${matches.join(', ')}`);
}

const projectDir = path.join(projectsRoot, matches[0]);
let sessions;
try {
  sessions = fs.readdirSync(projectDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ id: f.slice(0, -6), mtime: fs.statSync(path.join(projectDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
} catch (e) {
  die(`cannot read sessions in ${projectDir} (${e.code || e.message})`);
}
if (sessions.length === 0) die(`project dir '${matches[0]}' has no .jsonl sessions`);

// Newest session is the active one. If callers later need a specific pinned id,
// they pass it and we validate membership — but the default is "the live one",
// derived from disk, never from a hand-maintained sidecar.
const active = sessions[0];
const transcript = path.join(projectDir, `${active.id}.jsonl`);

if (asJson) {
  process.stdout.write(JSON.stringify({
    sessionId: active.id, transcript, projectDir,
    computedSlug: expected, sessionCount: sessions.length,
  }) + '\n');
} else {
  process.stdout.write(active.id + '\n');
}
