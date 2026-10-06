/**
 * get_instance_v2 must never return a credential.
 *
 * REGRESSION GUARD for 2026-09-05: the endpoint returned `preferences: prefs`
 * — the whole object, for ANY targetInstanceId, to ANY caller — and that object
 * carries `xmpp.password` in cleartext. Any instance could read any other
 * instance's messaging credential by asking for their record. No scoping, no
 * authorization check. Found by Crossing-2d23; verified by Lodestone-8ec9
 * against their OWN record only, which is the correct way to confirm a leak.
 *
 * The guard is a KEY PATTERN, not a field list, so a credential added to
 * preferences.json next year is redacted the day it appears rather than
 * leaking until someone notices.
 *
 * Run: node tests/test_get_instance_no_credential_leak.mjs
 */
import { redactSecrets } from '../src/v2/instances.js';

let fails = 0;
const check = (name, ok) => { if (!ok) fails++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`); };

const prefs = {
  instanceId: 'Test-0000', name: 'Test',
  xmpp: { jid: 'Test-0000@smoothcurves.nexus', password: 'DEADBEEFdeadbeef', registered: true },
  runtime: { channelPort: 21004, tmuxSession: 'Test-0000', notes: 'must survive' },
  apiKey: 'sk-leak', api_key: 'sk-leak', authToken: 'tok', passwd: 'p',
  privateKey: 'k', clientSecret: 'cs',
  nested: [{ secret: 'gone', keep: 'here' }],
  notifications: { telegram: { interrupt: true } }
};
const out = redactSecrets(prefs);
const json = JSON.stringify(out);

console.log('secrets removed:');
for (const k of ['apiKey', 'api_key', 'authToken', 'passwd', 'privateKey', 'clientSecret'])
  check(`${k} redacted`, out[k] === '[redacted]');
check('xmpp.password redacted', out.xmpp.password === '[redacted]');
check('secret inside an array', out.nested[0].secret === '[redacted]');

console.log('\nnon-secrets preserved (the UI depends on these):');
check('xmpp.jid', out.xmpp.jid === 'Test-0000@smoothcurves.nexus');
check('xmpp.registered', out.xmpp.registered === true);
check('runtime.channelPort', out.runtime.channelPort === 21004);
check('runtime.notes', out.runtime.notes === 'must survive');
check('notifications', out.notifications.telegram.interrupt === true);
check('array sibling', out.nested[0].keep === 'here');

console.log('\nthe assertions that actually matter:');
check('NO secret value anywhere in the payload', !json.includes('DEADBEEF') && !json.includes('sk-leak'));
check('caller input not mutated', prefs.xmpp.password === 'DEADBEEFdeadbeef');

console.log(`\n${fails === 0 ? 'ALL PASS' : fails + ' FAILURE(S)'}`);
process.exit(fails === 0 ? 0 : 1);
