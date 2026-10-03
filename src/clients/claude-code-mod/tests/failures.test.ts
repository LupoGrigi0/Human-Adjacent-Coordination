import { describe, expect, test } from 'claude-code/testing'

import { HUB_TIMEOUT_MS } from '../hooks/limits.js'
import { CONSUMER, useHacs } from './fixtures/consumer.js'
import { world } from './fixtures/world.js'

/**
 * Criterion 2: fails loudly, never silently. A hub error, a timeout, or
 * `success: false` rejects with the reason; send verifies delivered_to_id
 * against `to`, case-insensitive, and rejects on a mismatch.
 */
describe('C2 failures are loud', () => {
  test('C2 an unreachable hub rejects with the reason', { plugins: [CONSUMER] }, async ($, on) => {
    world(on, { hub: { list_my_messages: { unreachable: 'connect ECONNREFUSED 10.0.0.9:443' } } })

    const seen = await useHacs($, 'inbox')

    expect(seen.ok).toBeUndefined()
    expect(seen.err).toContain('hub unreachable')
    expect(seen.err).toContain('ECONNREFUSED')
  })

  test('C2 an HTTP error status rejects naming the status', { plugins: [CONSUMER] }, async ($, on) => {
    world(on, { hub: { get_personal_lists: { status: 502, text: 'Bad Gateway' } } })

    const seen = await useHacs($, 'lists')

    expect(seen.err).toContain('HTTP 502')
  })

  test('C2 a timeout rejects naming the timeout', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on, {
      hub: { list_my_messages: { slowMs: 60_000, then: { data: { success: true, messages: [] } } } },
    })

    const pending = useHacs($, 'inbox')
    await w.clock.settle()
    await w.clock.advance(HUB_TIMEOUT_MS)
    const seen = await pending
    await w.clock.advance(60_000)

    expect(seen.ok).toBeUndefined()
    expect(seen.err).toContain(`timed out after ${HUB_TIMEOUT_MS / 1000} s`)
  })

  test('C2 success:false rejects with the hub\'s own reason', { plugins: [CONSUMER] }, async ($, on) => {
    world(on, { hub: { list_my_messages: { data: { success: false, error: 'Rate limit exceeded. Wait a moment.' } } } })

    const seen = await useHacs($, 'inbox')

    expect(seen.err).toContain('Rate limit exceeded. Wait a moment.')
  })

  test('C2 a structured hub error ({code, message}) keeps both', { plugins: [CONSUMER] }, async ($, on) => {
    world(on, {
      hub: {
        get_personal_lists: {
          data: { success: false, error: { code: 'INVALID_INSTANCE_ID', message: 'Instance ID Forge-ba0e not found' } },
        },
      },
    })

    const seen = await useHacs($, 'lists')

    expect(seen.err).toContain('INVALID_INSTANCE_ID: Instance ID Forge-ba0e not found')
  })

  test('C2 a JSON-RPC error and a non-JSON body both reject', { plugins: [CONSUMER] }, async ($, on) => {
    world(on, {
      hub: {
        list_my_messages: { rpcError: 'Unknown tool' },
        get_personal_lists: { status: 200, text: '<html>maintenance</html>' },
      },
    })

    const rpc = await useHacs($, 'inbox')
    const html = await useHacs($, 'lists')

    expect(rpc.err).toContain('hub error: -32000')
    expect(rpc.err).toContain('Unknown tool')
    expect(html.err).toContain('not JSON')
  })

  test('C2 send rejects when delivered_to_id is someone else (the --force -> Forge lesson)', { plugins: [CONSUMER] }, async ($, on) => {
    world(on, {
      hub: {
        send_message: {
          data: { success: true, message_id: 'm-9', delivered_to: 'Lodestone', delivered_to_id: 'Lodestone-77aa' },
        },
      },
    })

    const seen = await useHacs($, 'send', { to: 'Lupo-f63b', subject: 's', body: 'b' })

    expect(seen.ok).toBeUndefined()
    expect(seen.err).toContain('MISDELIVERY')
    expect(seen.err).toContain('Lodestone-77aa')
    expect(seen.err).toContain('Lupo-f63b')
  })

  test('C2 send accepts a delivered_to_id that differs only in case', { plugins: [CONSUMER] }, async ($, on) => {
    world(on, {
      hub: { send_message: { data: { success: true, delivered_to: 'Lupo', delivered_to_id: 'Lupo-f63b' } } },
    })

    const seen = await useHacs($, 'send', { to: 'lupo-F63B', subject: 's', body: 'b' })

    expect(seen).toEqual({ ok: { messageId: null, deliveredTo: 'Lupo', deliveredToId: 'Lupo-f63b' } })
  })

  test('C2 send rejects when the hub reports no delivered_to_id', { plugins: [CONSUMER] }, async ($, on) => {
    world(on, { hub: { send_message: { data: { success: true, delivered_to: 'some-room' } } } })

    const seen = await useHacs($, 'send', { to: 'Lupo-f63b', subject: 's', body: 'b' })

    expect(seen.err).toContain('no delivered_to_id')
    expect(seen.err).toContain('check before resending')
  })

  test('C2 send refuses a flag-shaped recipient, a missing body and an oversized body before the hub', { plugins: [CONSUMER] }, async ($, on) => {
    const w = world(on)

    const flag = await useHacs($, 'send', { to: '--force', subject: 's', body: 'b' })
    const bare = await useHacs($, 'send', { to: 'Lupo-f63b', subject: 's', body: '' })
    const huge = await useHacs($, 'send', { to: 'Lupo-f63b', subject: 's', body: 'x'.repeat(8001) })
    const room = await useHacs($, 'send', { to: 'project:hacs', subject: 's', body: 'b' })
    const all = await useHacs($, 'send', { to: 'all', subject: 's', body: 'b' })

    expect(room.err, 'a room could never be verified, so it is refused before sending').toContain('room or broadcast')
    expect(all.err).toContain('room or broadcast')
    expect(flag.err).toContain('flag-shaped recipient')
    expect(bare.err).toContain('"body" is required')
    expect(huge.err).toContain('over 8000')
    expect(w.calls).toEqual([])
  })
})
