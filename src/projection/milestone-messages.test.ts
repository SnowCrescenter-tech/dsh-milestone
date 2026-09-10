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

  it('captures the user/message id for conversation-row anchor mapping', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 1 }),
      event('user/message', 1, 1001, { id: 'm-1', content: [{ type: 'text', text: 'q' }] }),
      // A malformed event without an id degrades to '' (never undefined/NaN).
      event('user/message', 3, 1003, { content: [{ type: 'text', text: 'no-id' }] }),
    ])
    expect(state.messages[0].messageId).toBe('m-1')
    expect(state.messages[1].messageId).toBe('')
  })

  it('closes turn metadata with end time and reason', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 2 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('turn/end', 9, 9000, { turn: 2, reason: { kind: 'completed' } }),
    ])
    expect(state.turns[0]).toMatchObject({ turn: 2, endTime: 9000, endReason: 'completed' })
  })

  it("records TTFT from the settlement stream's first token", () => {
    // Packed delta runs are what the accumulator persists: the first member's
    // reconstructed time (time0) is the TTFT anchor.
    const packed = fold([
      event('turn/start', 0, 1000, { turn: 3 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('assistant/message', 2, 3000, {
        turn: 3,
        step: 0,
        message: { role: 'assistant', content: [{ type: 'text', text: 'ab' }] },
        stream: [{ type: 'text-chunks', time0: 2500, index: 0, dt: [100], texts: ['a', 'b'] }],
      }),
    ])
    expect(packed.turns[0].firstChunkTime).toBe(2500)

    // A non-token chunk (block start) must NOT count as the first token.
    const raw = fold([
      event('turn/start', 0, 1000, { turn: 3 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('assistant/message', 2, 3000, {
        turn: 3,
        step: 0,
        message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
        stream: [
          { type: 'chunk', time: 2400, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
          { type: 'chunk', time: 2500, chunk: { type: 'text-delta', index: 0, text: 'a' } },
        ],
      }),
    ])
    expect(raw.turns[0].firstChunkTime).toBe(2500)
  })

  it('records TTFT from a message-less attempt settlement', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 5 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('assistant/attempt', 2, 3000, {
        turn: 5,
        step: 0,
        stream: [{ type: 'text-chunks', time0: 2100, index: 0, dt: [], texts: ['x'] }],
      }),
    ])
    expect(state.turns[0].firstChunkTime).toBe(2100)
  })

  it('degrades a pre-0.1.5 settlement without a stream instead of throwing', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 6 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('assistant/message', 2, 3000, {
        turn: 6,
        step: 0,
        message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
      }),
    ])
    expect(state.turns[0].firstChunkTime).toBeUndefined()
  })

  it('accumulates usage across steps and messages', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 4 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('assistant/message', 2, 3000, {
        turn: 4, step: 0,
        message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
        stream: [],
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      }),
      event('assistant/message', 5, 4000, {
        turn: 4, step: 1,
        message: { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
        stream: [],
        usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
      }),
    ])
    expect(state.turns[0].usage).toEqual({ input: 15, output: 27, total: 42 })
  })

  it('folds cached input into the billed input and falls back when total is absent', () => {
    const state = fold([
      event('turn/start', 0, 1000, { turn: 7 }),
      event('user/message', 1, 1001, { content: [{ type: 'text', text: 'q' }] }),
      event('assistant/message', 2, 3000, {
        turn: 7, step: 0,
        message: { role: 'assistant', content: [{ type: 'text', text: 'a' }] },
        stream: [],
        // Un-renamed (pre-0.1.5) fields must degrade to zero, not NaN.
        usage: { input: 9, output: 9, total: 9 },
      }),
      event('assistant/message', 5, 4000, {
        turn: 7, step: 1,
        message: { role: 'assistant', content: [{ type: 'text', text: 'b' }] },
        stream: [],
        usage: { inputTokens: 100, outputTokens: 40, cacheReadTokens: 1000, cacheWriteTokens: 3 },
      }),
    ])
    expect(state.turns[0].usage).toEqual({ input: 1103, output: 40, total: 1143 })
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