import { describe, expect, test } from 'claude-code/testing'

import { REDACTED } from '../hooks/limits.js'
import { CONSUMER, useHacs } from './fixtures/consumer.js'
import { SESSION, hacs, typed, unreadReply, world } from './fixtures/world.js'

const CANARY = 'CANARY-7f3a9c-do-not-leak'
const CANARY_ENV = 'CANARY-env-41b2e8-do-not-leak'

/**
 * Criterion 8: secrets live in ~/.hacs_secrets/; the mod reads them only in
 * its own code and never returns or logs them. A faked hub that echoes a
 * canary everywhere it can (an error, a subject, a body, a sender) must not
 * get it into any command output, status line, prompt context, preferences
 * write, store value, doorbell notice, or what another mod receives.
 */
describe('C8 secrets never reach context', () => {
  test('C8 a canary secret appears in no output, status line, context, preferences write or noun result', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on, {
      prefs: { hacs: { instanceId: 'Forge-ba0e', doorbell: true } },
      secrets: { hub_token: CANARY + '\n', 'other.env': `HACS_KEY="${CANARY_ENV}"\n` },
      hub: {
        do_i_have_new_messages: { data: { success: false, error: `bad token ${CANARY} / ${CANARY_ENV}` } },
        list_my_messages: {
          data: { success: true, messages: [{ id: 'm-1', from: CANARY, subject: `re: ${CANARY_ENV}`, date: 'd' }] },
        },
        get_message: { data: { success: true, from: CANARY, subject: CANARY, body: `the key is ${CANARY}`, date: 'd' } },
        get_personal_lists: { data: { success: true, lists: [{ key: CANARY, name: CANARY_ENV, taskCount: 1 }] } },
        send_message: { data: { success: false, error: `token ${CANARY} rejected` } },
      },
    })

    await $.session.start(SESSION)
    await w.clock.settle()

    const outputs: string[] = []
    for (const args of ['', 'inbox', 'read m-1', 'lists']) {
      outputs.push((await $.command.run(hacs(args))).text ?? '')
    }
    const prompt = await $.prompt.submit(typed('hello'))
    outputs.push(...(prompt.context ?? []))
    for (const [op, input] of [
      ['inbox', undefined],
      ['read', { id: 'm-1' }],
      ['lists', undefined],
      ['send', { to: 'Lupo-f63b', subject: 's', body: 'b' }],
    ] as const) {
      outputs.push(JSON.stringify(await useHacs($, op, input)))
    }

    // the doorbell rings for ids once the hub answers
    w.hub.do_i_have_new_messages = unreadReply(['m-1'])
    await w.clock.advance(60_000)

    const everything = [
      ...outputs,
      ...w.statuses.map(status => String(status)),
      ...w.submitted.map(prompt => prompt.text + JSON.stringify(prompt.context ?? [])),
      ...w.runs.map(run => JSON.stringify(run)),
      JSON.stringify([...w.stored.entries()]),
      ...w.calls.map(call => call.body),
    ].join('\n')

    expect(everything.includes(CANARY), 'the file canary leaked').toBe(false)
    expect(everything.includes(CANARY_ENV), 'the KEY=VALUE canary leaked').toBe(false)
    expect(everything.includes(REDACTED), 'the echoes reached the mod and were redacted').toBe(true)
    expect(w.runs.length >= 1, 'a preferences write happened and was checked').toBe(true)
  })

  test('C8 secrets in a JSON file, a key: value line, or behind a symbolic link are redacted too', async ($, on) => {
    const JSON_CANARY = 'CANARY-json-9d1c-do-not-leak'
    const YAML_CANARY = 'CANARY-yaml-5e7a-do-not-leak'
    const LINK_CANARY = 'CANARY-link-2b6f-do-not-leak'
    const w = world(on, {
      secrets: {
        'keys.json': JSON.stringify({ hub: { apiKey: JSON_CANARY } }),
        'keys.yaml': `api_key: ${YAML_CANARY}\n`,
        linked: LINK_CANARY + '\n',
      },
      linkedSecrets: ['linked'],
      hub: {
        get_message: {
          data: { success: true, from: 'x', subject: 's', body: `${JSON_CANARY} ${YAML_CANARY} ${LINK_CANARY}`, date: 'd' },
        },
      },
    })

    await $.session.start(SESSION)
    await w.clock.settle()
    const text = (await $.command.run(hacs('read m-1'))).text ?? ''

    expect(text.includes(JSON_CANARY), 'the JSON canary leaked').toBe(false)
    expect(text.includes(YAML_CANARY), 'the key: value canary leaked').toBe(false)
    expect(text.includes(LINK_CANARY), 'the linked canary leaked').toBe(false)
    expect(text).toContain(REDACTED)
  })

  test('C8 the mod sends no secret to the hub', async ($, on) => {
    const w = world(on, { secrets: { hub_token: CANARY } })

    await $.session.start(SESSION)
    await w.clock.settle()
    await $.command.run(hacs('inbox'))

    expect(w.calls.length >= 2).toBe(true)
    expect(w.calls.some(call => call.body.includes(CANARY))).toBe(false)
  })
})
