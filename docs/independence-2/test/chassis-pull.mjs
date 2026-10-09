/**
 * What would have to be true for the pull adapter to be safe:
 *  1. It DECLARES mode 'pull' statically — the registry must not have to call
 *     notify() to learn that it must not call notify().
 *  2. notify() NEVER reports success. A false delivery receipt in the hub's
 *     ledger is the one failure this whole design exists to prevent.
 *  3. notify() never throws — an adapter fault must not take down hub dispatch.
 *  4. detect() is pure, total, and says NO on garbage rather than throwing.
 *  5. detect() is not fooled by a DIFFERENT chassis's identity.
 */
import { claudeCodePullAdapter as A } from '../src/chassis/claude-code-pull.js';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? '  ok  ' : 'FAIL  '}${m}`); if (!c) fail++; };

// 1. the static declaration
ok(A.name === 'claude-code-pull', 'name is claude-code-pull');
ok(A.mode === 'pull', "mode is the STATIC string 'pull' (§8c)");
ok(typeof A.mode === 'string', 'mode is a property, not a function — no call needed to read it');

// 2. notify must never claim delivery
const r = await A.notify('Cairn-2001', { channel: 'hacs', from: 'x', count: '1' });
ok(r.ok === false, 'notify() returns ok:false — it NEVER claims delivery');
ok(/8c/.test(r.contract || r.error), 'the refusal cites the contract clause it is enforcing');
ok(/pull/.test(r.error), 'the refusal explains that this is a pull chassis');
ok(!/^ok$/i.test(String(r.ok)), 'there is no shape in which this returns a success receipt');

// 3. never throws, even on nonsense
let threw = false;
try { await A.notify(undefined, undefined); } catch { threw = true; }
ok(!threw, 'notify() does not throw on undefined input (hub dispatch must survive it)');

// 4/5. detect is pure, total, and discriminating
ok(A.detect('i', { chassis: 'claude-code-pull' }, null) === true, 'detects via identity.chassis');
ok(A.detect('i', null, { runtime: { type: 'claude-code-pull' } }) === true, 'detects via preferences runtime.type');
ok(A.detect('i', null, { independence: { config: { doorbell: 'pull' } } }) === true,
   "detects via preferences independence.config.doorbell (Lupo's single-key home)");
ok(A.detect('i', { chassis: 'claude-code-channel' }, null) === false,
   'does NOT claim an instance that declares the CHANNEL chassis');
ok(A.detect('i', null, null) === false, 'says NO when there is nothing to go on — never a default yes');
ok(A.detect('i', undefined, undefined) === false, 'undefined identity and prefs -> false, not a throw');
let dthrew = false;
try { A.detect('i', 'not-an-object', 42); } catch { dthrew = true; }
ok(!dthrew, 'detect() does not throw on garbage types');
ok(A.detect('i', {}, {}) === false, 'empty objects -> false');

console.log(fail ? `\n${fail} FAILED\n` : '\nall passed\n');
process.exit(fail ? 1 : 0);
