import type { Plugin } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

/**
 * Another mod that uses the `$.hacs` noun, as any consumer would. Its
 * `/use-hacs {"op": ..., "input": ...}` calls one method and answers with
 * `{"ok": value}` or `{"err": message}` as JSON text, so a test reads what
 * the caller saw, a rejection's reason included.
 *
 * Self-contained, as an inline plugin's register must be.
 */
export const CONSUMER: Plugin = {
  name: 'consumer',
  register(on) {
    on('command.run', { command: 'use-hacs' }, async ($, e) => {
      const { op, input } = JSON.parse(e.args) as { op: string; input?: unknown }
      try {
        let value: unknown
        if (op === 'send') value = await $.hacs.send(input as never)
        else if (op === 'inbox') value = await $.hacs.inbox(input as never)
        else if (op === 'read') value = await $.hacs.read(input as never)
        else if (op === 'lists') value = await $.hacs.lists()
        else throw new Error('unknown op ' + op)
        return { text: JSON.stringify({ ok: value }) }
      } catch (error) {
        return { text: JSON.stringify({ err: error instanceof Error ? error.message : String(error) }) }
      }
    })
  },
}

/** What the consumer saw: the method's value, or the rejection's message. */
export type Seen = { ok?: unknown; err?: string }

/** Has the consumer call `$.hacs.<op>(input)` and returns what it saw. */
export async function useHacs($: Engine, op: string, input?: unknown): Promise<Seen> {
  const answer = await $.command.run({
    command: 'use-hacs',
    args: JSON.stringify({ op, input }),
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })
  return JSON.parse(answer.text ?? '{}') as Seen
}
