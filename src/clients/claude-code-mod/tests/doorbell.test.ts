import { describe, expect, test } from 'claude-code/testing'

import { DOORBELL_PREFIX } from '../hooks/limits.js'
import { ME, SESSION, unreadReply, world } from './fixtures/world.js'

const POLL = 'do_i_have_new_messages'
const PERIOD_MS = 60_000
const RUNG_KEY = 'rung:' + ME
const DOORBELL_ON = { theme: 'dark', hacs: { instanceId: ME, doorbell: true } }

/**
 * What the store holds after the first load rang m-2 and m-1: the test of
 * the next load starts from exactly this.
 */
const RUNG_AFTER_FIRST_LOAD = ['m-2', 'm-1']

const rings = (submitted: readonly { text: string }[]) =>
  submitted.filter(prompt => prompt.text.startsWith(DOORBELL_PREFIX)).map(prompt => prompt.text)

/**
 * Criterion 5: the doorbell is off by default; with hacs.doorbell: true,
 * new mail gives one $.prompt.submit notice per message id, and rung ids
 * persist in $.store so a reload or resume does not ring them again.
 */
describe('C5 the doorbell', () => {
  test('C5 off by default: unread mail rings nothing', async ($, on) => {
    const w = world(on, { hub: { [POLL]: unreadReply(['m-2', 'm-1']) } })

    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(2 * PERIOD_MS)

    expect(w.statuses.at(-1)).toBe('2 unread')
    expect(w.submitted).toEqual([])
    expect(w.stored.has(RUNG_KEY)).toBe(false)
  })

  test('C5 on: one notice per message id, never twice', async ($, on) => {
    const w = world(on, { prefs: DOORBELL_ON, hub: { [POLL]: unreadReply(['m-2', 'm-1']) } })

    await $.session.start(SESSION)
    await w.clock.settle()

    const first = rings(w.submitted)
    expect(first.length).toBe(2)
    expect(first.filter(text => text.includes(' m-1 ')).length).toBe(1)
    expect(first.filter(text => text.includes(' m-2 ')).length).toBe(1)
    expect(w.stored.get(RUNG_KEY)).toEqual(RUNG_AFTER_FIRST_LOAD)

    await w.clock.advance(PERIOD_MS)
    expect(rings(w.submitted).length, 'the same mail rings no more').toBe(2)

    w.hub[POLL] = unreadReply(['m-3', 'm-2', 'm-1'])
    await w.clock.advance(PERIOD_MS)
    await w.clock.advance(PERIOD_MS)

    const all = rings(w.submitted)
    expect(all.length).toBe(3)
    expect(all.filter(text => text.includes(' m-3 ')).length).toBe(1)
  })

  test('C5 rung ids persist in $.store: the next load (reload, resume) does not ring them again', async ($, on) => {
    const w = world(on, {
      prefs: DOORBELL_ON,
      store: { [RUNG_KEY]: RUNG_AFTER_FIRST_LOAD },
      hub: { [POLL]: unreadReply(['m-3', 'm-2', 'm-1']) },
    })

    await $.session.start(SESSION)
    await w.clock.settle()

    const rung = rings(w.submitted)
    expect(rung.length).toBe(1)
    expect(rung[0]).toContain(' m-3 ')
    expect(w.stored.get(RUNG_KEY)).toEqual(['m-2', 'm-1', 'm-3'])
  })

  test('C5 a notice is one line naming the id and how to read it, without subject or body', async ($, on) => {
    const w = world(on, { prefs: DOORBELL_ON, hub: { [POLL]: unreadReply(['m-1']) } })

    await $.session.start(SESSION)
    await w.clock.settle()

    const [notice] = rings(w.submitted)
    expect(notice).toBe(
      `${DOORBELL_PREFIX} new HACS message m-1 for ${ME}. ` +
        'To read it: the user runs /hacs read m-1, or use `hacs read m-1` where the CLI exists.',
    )
  })

  test('C5 rung ids are saved before the notice goes out', async ($, on) => {
    const w = world(on, { prefs: DOORBELL_ON, hub: { [POLL]: unreadReply(['m-1']) } })

    await $.session.start(SESSION)
    await w.clock.settle()

    const saved = w.order.indexOf('store.set:' + RUNG_KEY)
    const rang = w.order.findIndex(entry => entry.startsWith('submit:' + DOORBELL_PREFIX))
    expect(saved >= 0 && rang > saved).toBe(true)
  })

  test('C5 a non-interactive session (claude -p, the SDK) never rings, and leaves the ids for the mind', async ($, on) => {
    const w = world(on, { prefs: DOORBELL_ON, hub: { [POLL]: unreadReply(['m-1']) } })

    await $.session.start({ ...SESSION, isInteractive: false })
    await w.clock.settle()
    await w.clock.advance(PERIOD_MS)

    expect(w.submitted).toEqual([])
    expect(w.stored.has(RUNG_KEY), 'no id is taken as rung').toBe(false)
    expect(w.statuses.at(-1)).toBe('1 unread')
  })

  test('C5 a doorbell notice carries no guidance, and the first typed prompt still gets its orientation', async ($, on) => {
    const w = world(on, { prefs: DOORBELL_ON, hub: { [POLL]: unreadReply(['m-1']) } })

    await $.session.start(SESSION)
    await w.clock.settle()
    const [notice] = w.submitted.filter(prompt => prompt.text.startsWith(DOORBELL_PREFIX))
    const typedPrompt = await $.prompt.submit({ text: 'good morning', wait: false, origin: { kind: 'composer' } })

    expect(notice?.context).toBeUndefined()
    expect((typedPrompt.context ?? []).length).toBe(1)
    expect(typedPrompt.context?.[0]).toContain('/hacs help')
  })

  test('C5 with no store the doorbell stays quiet rather than ringing every poll', async ($, on) => {
    const w = world(on, { prefs: DOORBELL_ON, isStoreBroken: true, hub: { [POLL]: unreadReply(['m-1']) } })

    await $.session.start(SESSION)
    await w.clock.settle()
    await w.clock.advance(2 * PERIOD_MS)

    expect(w.submitted).toEqual([])
    expect(w.statuses.at(-1), 'the status line still works').toBe('1 unread')
  })
})
