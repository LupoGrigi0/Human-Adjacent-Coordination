import { describe, expect, test } from 'claude-code/testing'

import { SESSION, hacs, typed, unreadReply, world } from './fixtures/world.js'

/**
 * Criterion 10 is checked live (a fixture with the mod directory removed
 * mid-run). These tests cover the design it relies on: whatever fails
 * inside the mod, the session's own events go on unchanged.
 */
describe('C10 degrades, never breaks the mind (design)', () => {
  test('C10 with no HOME, no files and no hub the session still starts and prompts pass through', async ($, on) => {
    const w = world(on, { isHomeless: true, hub: {} })

    const started = await $.session.start(SESSION)
    await w.clock.settle()
    const prompt = await $.prompt.submit(typed('still here'))
    const answer = await $.command.run(hacs('inbox'))

    expect(started).toEqual({ cwd: '/work' })
    expect(prompt.text).toBe('still here')
    expect(prompt.context).toBeUndefined()
    expect(answer.text).toContain('HOME is not set')
    expect(w.statuses.at(-1)).toBe('no identity (see /hacs help)')
  })

  test('C10 a taken /hacs name leaves the status line and the poll working', async ($, on) => {
    const w = world(on, { isCommandTaken: true, hub: { do_i_have_new_messages: unreadReply(['m-1']) } })

    const started = await $.session.start(SESSION)
    await w.clock.settle()

    expect(started).toEqual({ cwd: '/work' })
    expect(w.statuses.at(-1)).toBe('1 unread')
  })

  test('C10 a hub that fails every call never stops a prompt', async ($, on) => {
    const w = world(on, {
      hub: { do_i_have_new_messages: { unreachable: 'down' }, list_my_messages: { unreachable: 'down' } },
    })

    await $.session.start(SESSION)
    await w.clock.settle()
    const first = await $.prompt.submit(typed('a'))
    const second = await $.prompt.submit(typed('b'))

    expect(first.text).toBe('a')
    expect(second.text).toBe('b')
    expect(second.context).toBeUndefined()
  })
})
