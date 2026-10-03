import { describe, expect, test } from 'claude-code/testing'

import { MOD_VERSION, PREFS_HEARTBEAT_MS } from '../hooks/limits.js'
import { HUB, NOW, PREFS_PATH, SESSION, hacs, unreadReply, world } from './fixtures/world.js'

const POLL = 'do_i_have_new_messages'
const PERIOD_MS = 60_000

/**
 * Criterion 7: config and status live under the "hacs" key of
 * ~/preferences.json; writes go through the shipped atomic helper
 * (bin/hacs-prefs-merge.py, run by $.process.run with the patch on stdin),
 * which merges only the hacs key. The helper's own merge, atomicity and
 * refusal are tested in tests/helper/test_prefs_merge.py.
 */
describe('C7 preferences.json', () => {
  test('C7 a poll merges status and config defaults into the hacs key through the helper', async ($, on) => {
    const w = world(on, { hub: { [POLL]: unreadReply(['m-1']) } })

    await $.session.start(SESSION)
    await w.clock.settle()

    expect(w.runs.length).toBe(1)
    const [run] = w.runs
    expect(run?.argv.length).toBe(3)
    expect(run?.argv[0]).toBe('python3')
    expect(String(run?.argv[1]).endsWith('/bin/hacs-prefs-merge.py')).toBe(true)
    expect(run?.argv[2]).toBe(PREFS_PATH)
    expect(w.patches()).toEqual([
      {
        set: {
          lastPollAt: new Date(NOW).toISOString(),
          lastPollOk: true,
          unread: 1,
          unreadCapped: false,
          lastError: null,
          identitySource: 'preferences',
          modVersion: MOD_VERSION,
        },
        default: { hubUrl: HUB, pollSeconds: 60, doorbell: false },
      },
    ])
  })

  test('C7 the patch names only hacs fields: nothing else in the file can be touched', async ($, on) => {
    const w = world(on)

    await $.session.start(SESSION)
    await w.clock.settle()

    const [patch] = w.patches()
    expect(Object.keys(patch ?? {}).sort()).toEqual(['default', 'set'])
    expect(Object.keys(patch?.set ?? {}).sort()).toEqual(
      ['identitySource', 'lastError', 'lastPollAt', 'lastPollOk', 'modVersion', 'unread', 'unreadCapped'],
    )
    expect(Object.keys(patch?.default ?? {}).sort()).toEqual(['doorbell', 'hubUrl', 'pollSeconds'])
  })

  test('C7 an unreachable hub is recorded as unread: null with the reason, never 0', async ($, on) => {
    const w = world(on, { hub: { [POLL]: { unreachable: 'connect ECONNREFUSED' } } })

    await $.session.start(SESSION)
    await w.clock.settle()

    const [patch] = w.patches()
    expect(patch?.set.lastPollOk).toBe(false)
    expect(patch?.set.unread).toBe(null)
    expect(String(patch?.set.lastError)).toContain('ECONNREFUSED')
  })

  test('C7 an unchanged status is not rewritten until the heartbeat; a change is written at once', async ($, on) => {
    const w = world(on)

    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(PERIOD_MS)
    expect(w.runs.length, 'same status a minute later: no write').toBe(1)

    await w.clock.advance(PREFS_HEARTBEAT_MS)
    expect(w.runs.length, 'the heartbeat refreshes lastPollAt').toBe(2)

    w.hub[POLL] = unreadReply(['m-9'])
    await w.clock.advance(PERIOD_MS)
    expect(w.runs.length, 'a change is written at the next poll').toBe(3)
    expect(w.patches()[2]?.set.unread).toBe(1)
  })

  test('C7 a preferences.json that is not valid JSON is never written, and /hacs says so', async ($, on) => {
    const w = world(on, { prefs: '{ "hacs": { "instanceId": "Forge-ba0e" }, oops', identity: { instanceId: 'Forge-ba0e' } })

    await $.session.start(SESSION)
    await w.clock.settle()
    const answer = await $.command.run(hacs(''))

    expect(w.runs).toEqual([])
    expect(answer.text).toContain('~/preferences.json not valid JSON: not written')
  })

  test('C7 a failed helper run is reported by /hacs, not swallowed', async ($, on) => {
    const w = world(on, {
      helper: { exitCode: 4, stderr: 'hacs-prefs-merge: cannot write target (Permission denied)\n' },
    })

    await $.session.start(SESSION)
    await w.clock.settle()
    const answer = await $.command.run(hacs(''))

    expect(answer.text).toContain('write failed: hacs-prefs-merge: cannot write target (Permission denied)')
  })
})
