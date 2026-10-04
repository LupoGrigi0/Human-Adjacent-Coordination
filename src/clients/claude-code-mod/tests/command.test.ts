import { describe, expect, test } from 'claude-code/testing'

import { COMMAND_MAX_LINES } from '../hooks/limits.js'
import { ME, PREFS_PATH, SESSION, hacs, linesOf, unreadReply, world } from './fixtures/world.js'

const manyMessages = Array.from({ length: 15 }, (_, i) => ({
  id: `m-${i}`,
  from: 'Lupo-f63b',
  subject: `subject ${i} ` + 'long '.repeat(40),
  date: '2026-10-03T11:00:00.000Z',
}))

const longLetter = Array.from({ length: 60 }, (_, i) => `line ${i} of a long letter`).join('\n')

const manyLists = Array.from({ length: 13 }, (_, i) => ({ key: `l${i}`, name: `List ${i}`, taskCount: i, pendingCount: 0 }))

/**
 * Criterion 3: /hacs, /hacs inbox, /hacs read <id>, /hacs lists, /hacs help
 * answer through command.run in at most 12 lines and never start a turn
 * (no prompt.submit).
 */
describe('C3 the /hacs command', () => {
  test('C3 every /hacs subcommand answers in at most 12 lines and submits no prompt', async ($, on) => {
    const w = world(on, {
      hub: {
        do_i_have_new_messages: unreadReply(['m-2', 'm-1']),
        list_my_messages: { data: { success: true, messages: manyMessages } },
        get_message: { data: { success: true, from: 'Lupo-f63b', subject: 'long', body: longLetter, date: 'd' } },
        get_personal_lists: { data: { success: true, lists: manyLists } },
      },
    })
    await $.session.start(SESSION)
    await w.clock.settle()

    for (const args of ['', 'status', 'inbox', 'read m-1', 'lists', 'help', 'bogus', 'read']) {
      const answer = await $.command.run(hacs(args))
      expect(typeof answer.text, `/hacs ${args} answers with text`).toBe('string')
      const lines = linesOf(answer.text)
      expect(lines >= 1 && lines <= COMMAND_MAX_LINES, `/hacs ${args}: ${lines} lines`).toBe(true)
    }

    expect(w.submitted, 'no command started a turn').toEqual([])
  })

  test('C3 /hacs is registered at session start', async ($, on) => {
    const w = world(on)

    await $.session.start(SESSION)

    expect(w.registered).toEqual(['hacs'])
  })

  test('C3 /hacs status names the identity, the unread count and the doorbell', async ($, on) => {
    world(on, { hub: { do_i_have_new_messages: unreadReply(['m-2', 'm-1']) } })

    const answer = await $.command.run(hacs(''))

    expect(answer.text).toContain(`${ME} (from ${PREFS_PATH})`)
    expect(answer.text).toContain('2 unread (ids: m-2, m-1)')
    expect(answer.text).toContain('doorbell: off')
    expect(answer.text).toContain('/hacs help')
  })

  test('C3 /hacs inbox lists id, date, sender and subject', async ($, on) => {
    world(on, {
      hub: {
        list_my_messages: {
          data: { success: true, messages: [{ id: 'm-7', from: 'Lupo-f63b', subject: 'tea?', date: '2026-10-03T11:30:00.000Z' }] },
        },
      },
    })

    const answer = await $.command.run(hacs('inbox'))

    expect(answer.text).toBe(
      [`inbox for ${ME}: 1 unread`, 'm-7  2026-10-03T11:30  Lupo-f63b  tea?', 'read one: /hacs read <id>'].join('\n'),
    )
  })

  test("C3 /hacs inbox counts the hub's total_unread, not just the page it asked for", async ($, on) => {
    world(on, {
      hub: {
        list_my_messages: {
          data: { success: true, messages: manyMessages.slice(0, 10), more_unread: true, total_unread: 37 },
        },
      },
    })

    const answer = await $.command.run(hacs('inbox'))

    expect(answer.text?.split('\n')[0]).toBe(`inbox for ${ME}: 37 unread (27 not shown)`)
    expect(linesOf(answer.text) <= COMMAND_MAX_LINES).toBe(true)
  })

  test('C3 /hacs read shows the letter, and says loudly when it is cut', async ($, on) => {
    world(on, {
      hub: { get_message: { data: { success: true, from: 'Lupo-f63b', subject: 'long', body: longLetter, date: 'd' } } },
    })

    const answer = await $.command.run(hacs('read m-1'))
    const lines = (answer.text ?? '').split('\n')

    expect(lines[0]).toBe('From: Lupo-f63b   Date: d')
    expect(lines[1]).toBe('Subject: long')
    expect(lines.length).toBe(COMMAND_MAX_LINES)
    expect(lines[COMMAND_MAX_LINES - 1]).toMatch(/^\[TRUNCATED: \d+ more lines\. The hub has marked it read; full text: hacs read m-1\]$/)
  })

  test("C3 /hacs lists shows task counts and leaves out the hub's pendingCount", async ($, on) => {
    world(on)

    const answer = await $.command.run(hacs('lists'))

    expect(answer.text).toBe(
      [
        `lists for ${ME}: 1`,
        '- default: default, 14 tasks',
        "(open counts omitted: the hub's pendingCount reads 0 with open tasks)",
      ].join('\n'),
    )
  })

  test('C3 a failing hub is reported in the command text, never swallowed', async ($, on) => {
    world(on, { hub: { list_my_messages: { unreachable: 'getaddrinfo ENOTFOUND smoothcurves.nexus' } } })

    const answer = await $.command.run(hacs('inbox'))

    expect(answer.text).toContain('hacs.inbox: list_my_messages: hub unreachable')
    expect(answer.text).toContain('ENOTFOUND')
  })

  test('C3 /hacs help fits and points at the config and the noun', async ($, on) => {
    world(on)

    const answer = await $.command.run(hacs('help'))

    expect(linesOf(answer.text) <= COMMAND_MAX_LINES).toBe(true)
    expect(answer.text).toContain('preferences.json in the launch directory')
    expect(answer.text).toContain('$.hacs.send({to, subject, body})')
  })
})
