import { describe, expect, test } from 'claude-code/testing'

import { REDACTED } from '../hooks/limits.js'
import { CONSUMER, useHacs } from './fixtures/consumer.js'
import {
  HOME,
  IDENTITY_PATH,
  LAUNCH,
  NO_CWD,
  PREFS_PATH,
  SECRETS_DIR,
  hacs,
  startedIn,
  world,
} from './fixtures/world.js'

const LAUNCH_PREFS = LAUNCH + '/preferences.json'
const LAUNCH_ID = 'Launch-0001'
const HOME_ID = 'Home-0002'

/**
 * The 2026-10-04 change to criterion 7 (Lupo): preferences.json is the one
 * in the directory Claude Code was launched from (`e.cwd` of the first
 * session.start the mod sees), not ~/preferences.json, and .hacs_secrets/
 * sits beside it. ~/.hacs-identity stays in HOME. With no cwd, HOME is
 * used, and /hacs says so.
 */
describe('Launch directory (criterion 7, 2026-10-04)', () => {
  test('LD preferences are read from the launch dir (e.cwd), not HOME, when they differ', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on, {
      launchDir: LAUNCH,
      prefs: { hacs: { instanceId: LAUNCH_ID } },
      files: { [PREFS_PATH]: { hacs: { instanceId: HOME_ID } } },
    })

    await $.session.start(startedIn(LAUNCH))
    await w.clock.settle()
    const answer = await $.command.run(hacs(''))
    await useHacs($, 'lists')

    expect(w.calls.length >= 3).toBe(true)
    expect(w.calls.every(call => call.args.instanceId === LAUNCH_ID || call.args.from === LAUNCH_ID)).toBe(true)
    expect(w.calls.some(call => JSON.stringify(call.args).includes(HOME_ID)), 'nothing done as the HOME identity').toBe(false)
    expect(w.runs.length >= 1).toBe(true)
    expect(w.runs.every(run => run.argv[2] === LAUNCH_PREFS), 'the helper gets the launch-dir path').toBe(true)
    expect(answer.text).toContain(`${LAUNCH_ID} (from ${LAUNCH_PREFS})`)
    expect(answer.text).toContain(`config: ${LAUNCH_PREFS} (launch dir)`)
    expect(answer.text?.includes('~/preferences.json')).toBe(false)
  })

  test('LD a later session.start with another cwd does not move the preferences', { plugins: [CONSUMER] }, async ($, on) => {
    const ELSEWHERE = '/srv/other'
    const w = world(on, {
      launchDir: LAUNCH,
      prefs: { hacs: { instanceId: LAUNCH_ID } },
      files: { [ELSEWHERE + '/preferences.json']: { hacs: { instanceId: 'Elsewhere-0003' } } },
    })

    await $.session.start(startedIn(LAUNCH))
    await w.clock.settle()
    await $.session.start(startedIn(ELSEWHERE))
    await w.clock.settle()
    await w.clock.advance(60_000)
    const answer = await $.command.run(hacs(''))
    await useHacs($, 'inbox')

    expect(w.calls.length >= 3).toBe(true)
    expect(w.calls.some(call => JSON.stringify(call.args).includes('Elsewhere-0003')), 'nothing done as the later cwd identity').toBe(false)
    expect(w.runs.every(run => run.argv[2] === LAUNCH_PREFS)).toBe(true)
    expect(answer.text).toContain(`config: ${LAUNCH_PREFS} (launch dir)`)
  })

  test('LD secrets are read from <launchDir>/.hacs_secrets and the canary still never leaks', { plugins: [CONSUMER] }, async ($, on) => {
    const CANARY = 'CANARY-launch-3c8e-do-not-leak'
    const w = world(on, {
      launchDir: LAUNCH,
      prefs: { hacs: { instanceId: LAUNCH_ID } },
      secrets: { hub_token: CANARY + '\n' },
      hub: {
        do_i_have_new_messages: { data: { success: false, error: `bad token ${CANARY}` } },
        get_message: { data: { success: true, from: CANARY, subject: CANARY, body: `key ${CANARY}`, date: 'd' } },
        send_message: { data: { success: false, error: `token ${CANARY} rejected` } },
      },
    })

    await $.session.start(startedIn(LAUNCH))
    await w.clock.settle()
    const outputs = [
      (await $.command.run(hacs(''))).text ?? '',
      (await $.command.run(hacs('read m-1'))).text ?? '',
      JSON.stringify(await useHacs($, 'send', { to: 'Lupo-f63b', subject: 's', body: 'b' })),
    ]
    const everything = [
      ...outputs,
      ...w.statuses.map(status => String(status)),
      ...w.runs.map(run => JSON.stringify(run)),
      ...w.calls.map(call => call.body),
    ].join('\n')

    expect(everything.includes(CANARY), 'the launch-dir canary leaked').toBe(false)
    expect(everything.includes(REDACTED), 'the secret was read from the launch dir and redacted').toBe(true)
    expect(everything.includes(SECRETS_DIR), 'HOME/.hacs_secrets is not named').toBe(false)
  })

  test('LD the ~/.hacs-identity fallback still reads from HOME, not the launch dir', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on, {
      launchDir: LAUNCH,
      prefs: { theme: 'dark' },
      identity: { instanceId: HOME_ID },
      files: { [LAUNCH + '/.hacs-identity']: { instanceId: 'Decoy-0004' } },
    })

    await $.session.start(startedIn(LAUNCH))
    await w.clock.settle()
    const answer = await $.command.run(hacs(''))
    await useHacs($, 'inbox')

    expect(w.files[IDENTITY_PATH]).toContain(HOME_ID)
    expect(w.calls.length >= 2).toBe(true)
    expect(w.calls.every(call => call.args.instanceId === HOME_ID)).toBe(true)
    expect(answer.text).toContain(`${HOME_ID} (from ~/.hacs-identity (${LAUNCH_PREFS} is missing or has no hacs.instanceId))`)
    expect(w.patches()[0]?.set.identitySource).toBe('hacs-identity')
  })

  test('LD a session.start with no usable cwd falls back to HOME, and /hacs says so', async ($, on) => {
    const w = world(on, { prefs: { hacs: { instanceId: HOME_ID } } })

    await $.session.start(NO_CWD)
    await w.clock.settle()
    const answer = await $.command.run(hacs(''))

    expect(w.calls.every(call => call.args.instanceId === HOME_ID)).toBe(true)
    expect(w.runs.every(run => run.argv[2] === PREFS_PATH)).toBe(true)
    expect(answer.text).toContain(`config: ${HOME}/preferences.json (launch dir unknown; using HOME)`)
  })
})
