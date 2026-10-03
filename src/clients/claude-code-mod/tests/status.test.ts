import { describe, expect, test } from 'claude-code/testing'

import { HUB_TIMEOUT_MS } from '../hooks/limits.js'
import { ME, SESSION, unreadReply, world } from './fixtures/world.js'

const POLL = 'do_i_have_new_messages'
const PERIOD_MS = 60_000

/** True when a status line shows a count of zero. */
const isZero = (status: string | undefined): boolean => /^0\+? unread/.test(status ?? '')

/**
 * Criterion 4: a $.clock.every timer (60 s by default) drives the status
 * line: "N unread" after a look, "hub unreachable" when the mod could not
 * look (never 0), and it never starts a turn. The engine shows the line as
 * "⚠ hacs: <text>", so the text itself carries no prefix.
 */
describe('C4 the status line', () => {
  test('C4 the timer shows "N unread", looking every 60 s by default', async ($, on) => {
    const w = world(on)

    await $.session.start(SESSION)
    expect(w.statuses, 'before the first look').toEqual(['checking...'])

    await w.clock.settle()
    expect(w.statuses.at(-1), 'the first look runs at once').toBe('0 unread')

    w.hub[POLL] = unreadReply(['m-2', 'm-1'])
    await w.clock.advance(PERIOD_MS)

    expect(w.statuses.at(-1)).toBe('2 unread')
    expect(w.count(POLL)).toBe(2)
  })

  test('C4 an unreachable hub shows "hub unreachable", never 0 and never a stale count', async ($, on) => {
    const w = world(on, { hub: { [POLL]: unreadReply(['m-3', 'm-2', 'm-1']) } })

    await $.session.start(SESSION)
    await w.clock.settle()
    expect(w.statuses.at(-1)).toBe('3 unread')

    w.hub[POLL] = { unreachable: 'connect ETIMEDOUT' }
    await w.clock.advance(PERIOD_MS)
    expect(w.statuses.at(-1)).toBe('hub unreachable')

    w.hub[POLL] = { status: 503, text: 'Service Unavailable' }
    await w.clock.advance(PERIOD_MS)
    expect(w.statuses.at(-1)).toBe('hub unreachable')

    expect(w.statuses.some(isZero), 'no zero was ever shown').toBe(false)

    w.hub[POLL] = unreadReply([])
    await w.clock.advance(PERIOD_MS)
    expect(w.statuses.at(-1), 'a real zero, once the hub answers').toBe('0 unread')
  })

  test('C4 a hub that times out reads "hub unreachable"', async ($, on) => {
    const w = world(on, { hub: { [POLL]: { slowMs: 120_000, then: unreadReply([]) } } })

    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(HUB_TIMEOUT_MS)

    expect(w.statuses.at(-1)).toBe('hub unreachable')
    expect(w.statuses.some(isZero)).toBe(false)
    await w.clock.advance(120_000)
  })

  test('C4 a hub refusal (success:false) reads "hub error", never a count', async ($, on) => {
    const w = world(on, { hub: { [POLL]: { data: { success: false, error: 'Messaging system unavailable' } } } })

    await $.session.start(SESSION)
    await w.clock.settle()

    expect(w.statuses.at(-1)).toBe('hub error (see /hacs)')
    expect(w.statuses.some(isZero)).toBe(false)
  })

  test('C4 new_messages: true with no usable ids reads "hub error", never 0', async ($, on) => {
    const w = world(on, { hub: { [POLL]: { data: { success: true, new_messages: true, unread_ids: [42] } } } })

    await $.session.start(SESSION)
    await w.clock.settle()

    expect(w.statuses.at(-1)).toBe('hub error (see /hacs)')
    expect(w.statuses.some(isZero)).toBe(false)
  })

  test('C4 five unread ids (the hub\'s cap) read as "5+ unread"', async ($, on) => {
    const w = world(on, { hub: { [POLL]: unreadReply(['a1', 'a2', 'a3', 'a4', 'a5']) } })

    await $.session.start(SESSION)
    await w.clock.settle()

    expect(w.statuses.at(-1)).toBe('5+ unread')
  })

  test('C4 no identity reads "no identity", never a count, and asks the hub nothing', async ($, on) => {
    const w = world(on, { prefs: { theme: 'dark' } })

    await $.session.start(SESSION)
    await w.clock.settle()

    expect(w.statuses.at(-1)).toBe('no identity (see /hacs help)')
    expect(w.calls).toEqual([])
  })

  test('C4 session.start re-arms the timer: after a second start, one look per period', async ($, on) => {
    const w = world(on)

    await $.session.start(SESSION)
    await $.session.start(SESSION)
    await w.clock.settle()
    const before = w.count(POLL)

    await w.clock.advance(PERIOD_MS)
    expect(w.count(POLL) - before, 'one interval, not two').toBe(1)

    await w.clock.advance(PERIOD_MS)
    expect(w.count(POLL) - before).toBe(2)
  })

  test('C4 hacs.pollSeconds in preferences sets the period', async ($, on) => {
    const w = world(on, { prefs: { hacs: { instanceId: ME, pollSeconds: 120 } } })

    await $.session.start(SESSION)
    await w.clock.settle()
    expect(w.count(POLL)).toBe(1)

    await w.clock.advance(PERIOD_MS)
    expect(w.count(POLL)).toBe(1)

    await w.clock.advance(PERIOD_MS)
    expect(w.count(POLL)).toBe(2)
  })

  test('C4 the status poll never starts a turn', async ($, on) => {
    const w = world(on, { hub: { [POLL]: unreadReply(['m-2', 'm-1']) } })

    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(3 * PERIOD_MS)

    expect(w.count(POLL)).toBe(4)
    expect(w.submitted).toEqual([])
  })
})
