import { describe, expect, it } from 'vitest'
import { SessionLogOffset, type SessionEvent } from '@deepseek-ai/dsh-session'
import {
  fullText,
  milestoneMessagesProjectionDefinition,
  previewText,
  type MilestoneMessagesState,
} from './milestone-messages'

function event(type: string, seq: number, time: number, data: unknown): SessionEvent {
  return { type, seq, time, data } as SessionEvent
}

function fold(events: readonly SessionEvent[]): MilestoneMessagesState {
  let state = milestoneMessagesProjectionDefinition.init({} as never, SessionLogOffset(0))
  for (const e of events) state = milestoneMessagesProjectionDefinition.apply(state, e)
  return state
}

describe('milestone.messages projection', () => {
  it('extracts user messages with seq/time/turn/preview/full text', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 1 }),
      event('user/message', 1, 1001, {
        content: [{ type: 'text', text: 'hello world' }],
      }),
      event('user/message', 3, 1003, {
        content: [{ type: 'text', text: 'second' }, { type: 'image', url: 'x' }],
      }),
    ])
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0]).toMatchObject({ seq: 1, time: 1001, turn: 1, preview: 'hello world', text: 'hello world' })
    expect(state.messages[1]).toMatchObject({ seq: 3, time: 1003, turn: 1, preview: 'second' })
    expect(state.turns).toHaveLength(1)
    expect(state.turns[0]).toMatchObject({ turn: 1, startSeq: 0, startTime: 1000 })
  })

  it('closes turn metadata with end time and reason', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 2 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('turn/end', 9, 9000, { turn: 2, reason: { kind: 'completed' } }),
    ])
    expect(state.turns[0]).toMatchObject({ turn: 2, endTime: 9000, endReason: 'completed' })
  })

  it('records TTFT from the first assistant chunk', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 3 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('assistant/chunk', 2, 2500, { turn: 3, step: 0, chunk: { type: 'text', text: 'a' } }),
      event('assistant/chunk', 3, 2600, { turn: 3, step: 0, chunk: { type: 'text', text: 'b' } }),
    ])
    expect(state.turns[0].firstChunkTime).toBe(2500)
  })

  it('accumulates usage across steps and messages', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 4 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('assistant/message', 2, 3000, {
        turn: 4, step: 0,
        message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
        usage: { input: 10, output: 20, total: 30 },
      }),
      event('assistant/message', 5, 4000, {
        turn: 4, step: 1,
        message: { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
        usage: { input: 5, output: 7, total: 12 },
      }),
    ])
    expect(state.turns[0].usage).toEqual({ input: 15, output: 27, total: 42 })
  })

  it('keeps reference stability for no-op applies', () => {
    const events = [
      event('turn/start', 0, 1000, { turn: 1 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
    ]
    let state = fold(events)
    const snapshot = state
    // An unrelated event type must not change the state reference.
    state = milestoneMessagesProjectionDefinition.apply(state, event('unknown-event', 2, 1002, {}))
    expect(state).toBe(snapshot)
    // A duplicate turn/start must not change the reference either.
    state = milestoneMessagesProjectionDefinition.apply(state, event('turn/start', 3, 1003, { turn: 1 }))
    expect(state).toBe(snapshot)
    // A real change must produce a new reference.
    state = milestoneMessagesProjectionDefinition.apply(state, event('turn/end', 4, 2000, { turn: 1, reason: { kind: 'completed' } }))
    expect(state).not.toBe(snapshot)
    expect(state.turns[0].endReason).toBe('completed')
  })

  it('wire view projects messages and turns', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 1 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
    ])
    const view = milestoneMessagesProjectionDefinition.wire!.view(state)
    expect(view.messages).toHaveLength(1)
    expect(view.turns).toHaveLength(1)
    expect(milestoneMessagesProjectionDefinition.wire!.viewSchema.safeParse(view).success).toBe(true)
  })
})

describe('text helpers', () => {
  it('previewText joins text blocks, collapses whitespace, and caps with an ellipsis', () => {
    expect(previewText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], 80)).toBe('a b')
    expect(previewText([{ type: 'text', text: 'x'.repeat(200) }], 10)).toBe('xxxxxxxxx…')
    expect(previewText([{ type: 'image' }, { type: 'text', text: 'only' }], 80)).toBe('only')
  })

  it('fullText keeps newlines between blocks', () => {
    expect(fullText([{ type: 'text', text: 'line1' }, { type: 'text', text: 'line2' }])).toBe('line1\nline2')
    expect(fullText([{ type: 'image' }])).toBe('')
  })
})