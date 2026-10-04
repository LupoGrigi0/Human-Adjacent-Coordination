import { describe, expect, test } from 'claude-code/testing'

import { CONSUMER, useHacs } from './fixtures/consumer.js'
import { HUB, ME, PREFS_PATH, world } from './fixtures/world.js'

/**
 * Criterion 1: the `$.hacs` noun (send, inbox, read, lists), identity from
 * preferences.json (hacs.instanceId), never from arguments; checked
 * through another mod's calls against a faked hub (on('http.fetch')).
 */
describe('C1 the $.hacs noun', () => {
  test('C1 send posts send_message from the configured instanceId, never from arguments', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on)

    const seen = await useHacs($, 'send', {
      to: 'Lupo-f63b',
      subject: 'hello',
      body: 'hi there',
      from: 'Impostor-0000',
    })

    expect(seen).toEqual({ ok: { messageId: 'm-sent-1', deliveredTo: 'Lupo-f63b', deliveredToId: 'Lupo-f63b' } })
    expect(w.calls.map(call => [call.fn, call.args])).toEqual([
      ['send_message', { from: ME, to: 'Lupo-f63b', subject: 'hello', body: 'hi there' }],
    ])
    expect(w.calls[0]?.url).toBe(HUB)
  })

  test('C1 inbox, read and lists call their hub functions as the configured instanceId', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on, {
      hub: {
        list_my_messages: {
          data: {
            success: true,
            messages: [
              { id: 'm-2', from: 'Lupo-f63b', subject: 'second', date: '2026-10-03T11:30:00.000Z' },
              { id: 'm-1', from: 'Bastion-3012', subject: 'first', date: '2026-10-03T10:00:00.000Z' },
            ],
          },
        },
      },
    })

    const inbox = await useHacs($, 'inbox', { limit: 3 })
    const letter = await useHacs($, 'read', { id: 'm-2' })
    const lists = await useHacs($, 'lists')

    expect(inbox).toEqual({
      ok: [
        { id: 'm-2', from: 'Lupo-f63b', subject: 'second', date: '2026-10-03T11:30:00.000Z' },
        { id: 'm-1', from: 'Bastion-3012', subject: 'first', date: '2026-10-03T10:00:00.000Z' },
      ],
    })
    expect(letter).toEqual({
      ok: { id: 'm-2', from: 'Lupo-f63b', subject: 'hello', date: '2026-10-03T11:00:00.000Z', body: 'hi Forge' },
    })
    expect(lists, "the hub's pendingCount is not passed on").toEqual({
      ok: [{ key: 'default', name: 'default', taskCount: 14 }],
    })
    expect(w.calls.map(call => [call.fn, call.args])).toEqual([
      ['list_my_messages', { instanceId: ME, limit: 3 }],
      ['get_message', { instanceId: ME, messageId: 'm-2', id: 'm-2' }],
      ['get_personal_lists', { instanceId: ME }],
    ])
  })

  test('C1 identity falls back to ~/.hacs-identity when preferences has no hacs.instanceId', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on, { prefs: { theme: 'dark' }, identity: { instanceId: 'Forge-ba0e', sessionName: 'x' } })

    await useHacs($, 'inbox')

    expect(w.calls.map(call => call.args.instanceId)).toEqual(['Forge-ba0e'])
  })

  test('C1 a broken preferences.json never falls back to ~/.hacs-identity', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on, { prefs: '{"hacs": {"instanceId": "Forge-ba0e"', identity: { instanceId: 'Other-0000' } })

    const seen = await useHacs($, 'inbox')

    expect(seen.err).toContain('no identity')
    expect(w.calls, 'nothing is done as another identity').toEqual([])
  })

  test('C1 with no identity anywhere the noun rejects, naming where to set it, and calls no hub', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on, { prefs: null })

    const seen = await useHacs($, 'inbox')

    expect(seen.err).toContain('no identity')
    expect(seen.err, 'with no session seen, the HOME fallback path is named').toContain(PREFS_PATH)
    expect(w.calls).toEqual([])
  })

  test('C1 the hub URL comes from preferences (hacs.hubUrl)', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on, { prefs: { hacs: { instanceId: ME, hubUrl: 'https://hub.example/mcp' } } })

    await useHacs($, 'lists')

    expect(w.calls.map(call => call.url)).toEqual(['https://hub.example/mcp'])
  })
})
