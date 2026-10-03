import { describe, expect, test } from 'claude-code/testing'

import type { Config } from '../hooks/config.js'
import { firstGuidance, unreadGuidance, INITIAL_STATE } from '../hooks/format.js'
import { GUIDANCE_MAX_LINES } from '../hooks/limits.js'
import { ME, SESSION, linesOf, typed, unreadReply, world } from './fixtures/world.js'

const POLL = 'do_i_have_new_messages'
const PERIOD_MS = 60_000

/** The guidance a prompt carried: the context entries the mod added. */
const notesOf = (result: { context?: readonly string[] }, before: readonly string[] = []) =>
  (result.context ?? []).slice(before.length)

/**
 * Criterion 6: guidance rides prompt.submit context (which sec-default
 * leaves alone), at most 6 lines, only on the first prompt of a session or
 * when the inbox has unread mail, pointing to /hacs help.
 */
describe('C6 guidance', () => {
  test('C6 the first prompt of a session gets at most 6 lines that point to /hacs help', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()

    const result = await $.prompt.submit(typed('good morning'))
    const notes = notesOf(result)

    expect(result.text).toBe('good morning')
    expect(notes.length).toBe(1)
    expect(linesOf(notes[0]) <= GUIDANCE_MAX_LINES).toBe(true)
    expect(notes[0]).toContain(ME)
    expect(notes[0]).toContain('/hacs help')
    expect(notes[0]).toContain('inbox: 0 unread')
  })

  test('C6 later prompts with an empty inbox carry nothing', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()

    await $.prompt.submit(typed('one'))
    const second = await $.prompt.submit(typed('two'))
    const third = await $.prompt.submit(typed('three'))

    expect(second.context).toBeUndefined()
    expect(third.context).toBeUndefined()
  })

  test('C6 unread mail adds a short note, once per change in what is unread', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    await $.prompt.submit(typed('first'))

    w.hub[POLL] = unreadReply(['m-1'])
    await w.clock.advance(PERIOD_MS)
    const noted = await $.prompt.submit(typed('anything new?'))
    const again = await $.prompt.submit(typed('and now?'))

    w.hub[POLL] = unreadReply(['m-2', 'm-1'])
    await w.clock.advance(PERIOD_MS)
    const more = await $.prompt.submit(typed('more?'))

    expect(notesOf(noted).length).toBe(1)
    expect(notesOf(noted)[0]).toContain('1 unread message(s)')
    expect(notesOf(noted)[0]).toContain('m-1')
    expect(notesOf(noted)[0]).toContain('/hacs help')
    expect(linesOf(notesOf(noted)[0]) <= GUIDANCE_MAX_LINES).toBe(true)
    expect(again.context, 'the same unread set is not repeated').toBeUndefined()
    expect(notesOf(more)[0]).toContain('m-2, m-1')
  })

  test('C6 guidance keeps the context already riding the prompt', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()

    const result = await $.prompt.submit(typed('hi', ['from another mod']))

    expect(result.context?.[0]).toBe('from another mod')
    expect(result.context?.length).toBe(2)
  })

  test('C6 guidance asks the hub nothing: it reads what the last poll found', async ($, on) => {
    const w = world(on)
    await $.session.start(SESSION)
    await w.clock.settle()
    const before = w.calls.length

    await $.prompt.submit(typed('one'))
    await $.prompt.submit(typed('two'))

    expect(w.calls.length).toBe(before)
  })

  test('C6 an identity from ~/.hacs-identity is named, and a missing one is explained', async ($, on) => {
    const w = world(on, { prefs: { theme: 'dark' }, identity: { instanceId: ME } })
    await $.session.start(SESSION)
    await w.clock.settle()

    const result = await $.prompt.submit(typed('hi'))

    expect(notesOf(result)[0]).toContain('~/.hacs-identity')
  })

  test('C6 the guidance text is held to 6 lines whatever it is given', () => {
    const config: Config = {
      home: '/h',
      prefsPath: '/h/preferences.json',
      secretsDir: '/h/.hacs_secrets',
      instanceId: 'X-0000\nline\nline\nline\nline\nline\nline\nline',
      identitySource: 'hacs-identity',
      hubUrl: 'https://smoothcurves.nexus/mcp',
      pollSeconds: 60,
      doorbell: false,
      prefsProblem: null,
      secrets: [],
    }
    const state = { ...INITIAL_STATE, phase: 'ok' as const, unread: 3, ids: ['a'.repeat(500), 'b', 'c'] }

    for (const text of [firstGuidance(config, state), unreadGuidance(config, state)]) {
      expect(linesOf(text) <= GUIDANCE_MAX_LINES).toBe(true)
      expect(text.split('\n').every(line => line.length <= 200)).toBe(true)
    }
  })
})
