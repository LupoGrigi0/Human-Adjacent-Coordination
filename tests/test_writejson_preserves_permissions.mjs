/**
 * test_writejson_preserves_permissions.mjs
 *
 * writeJSON() replaces the inode (temp file + rename). Without an explicit
 * carry-over, every atomic write resets the file to the WRITER's uid/gid and
 * umask — so any permission set outside the API silently reverts on the next
 * API call, with no event to blame it on.
 *
 * That matters because instances are given group-write on their own
 * personal_tasks.json / personal_goals.json / lists.json so they can bulk-edit
 * them from their home directory instead of one API call at a time. Without
 * this guarantee that grant lasts until the next task operation and no longer.
 *
 * Run as root (needs chown):  node tests/test_writejson_preserves_permissions.mjs
 * Skips cleanly if not root.
 *
 * Bastion (DevOps), 2026-08-28
 */
import { writeJSON, readJSON } from '../src/v2/data.js';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

if (process.getuid() !== 0) {
  console.log('SKIP: needs root (chown). Not a failure.');
  process.exit(0);
}

const DIR = path.join(os.tmpdir(), `writejson-perm-${process.pid}`);
let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}: got ${got}${ok ? '' : `, want ${want}`}`);
};

await fs.rm(DIR, { recursive: true, force: true });
await fs.mkdir(DIR, { recursive: true });

// Any non-root gid will do; 'nogroup'/'nobody' exist everywhere.
const GID = 65534;

console.log('CASE 1  existing root:<gid> 0664 grant must survive an API write');
const f1 = path.join(DIR, 'personal_tasks.json');
await fs.writeFile(f1, '{"seed":true}\n');
await fs.chown(f1, 0, GID);
await fs.chmod(f1, 0o664);
await writeJSON(f1, { tasks: ['written by the API'] });
let st = await fs.stat(f1);
check('uid', st.uid, 0);
check('gid', st.gid, GID);
check('mode', (st.mode & 0o7777).toString(8), '664');
check('content round-trips', (await readJSON(f1)).tasks[0], 'written by the API');

console.log('\nCASE 2  new file (ENOENT path) still created, no crash');
const f2 = path.join(DIR, 'brand_new.json');
await writeJSON(f2, { hello: 'world' });
check('created', (await readJSON(f2)).hello, 'world');

console.log('\nCASE 3  no .tmp litter left behind');
check('leftover temp files',
  (await fs.readdir(DIR)).filter(n => n.includes('.tmp.')).length, 0);

console.log('\nCASE 4  a restrictive 0600 must NOT be widened');
const f4 = path.join(DIR, 'restrictive.json');
await fs.writeFile(f4, '{}\n');
await fs.chmod(f4, 0o600);
await writeJSON(f4, { a: 1 });
st = await fs.stat(f4);
check('mode', (st.mode & 0o7777).toString(8), '600');

await fs.rm(DIR, { recursive: true, force: true });
console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURE(S)'}`);
process.exit(fails === 0 ? 0 : 1);
