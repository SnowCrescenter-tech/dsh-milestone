/**
 * milestone.messages projection: whole-log user-message outline for the
 * milestone rail.
 *
 * dsh 0.1.2 removed conversation data from the session-scoped `useSession`
 * snapshot (session-scoped standard kit now only carries lifecycle state;
 * chat data moved into the chat-slot-only `useChat`). The 0.1.2-native way
 * for a non-chat-slot plugin to read conversation content is a session
 * projection: a pure fold over committed session events, served to clients
 * through `useProjection(key)` — covering the WHOLE log, not just the paged
 * window (this also removes the plugin's long-standing "rail only covers the
 * loaded window" limitation).
 *
 * Fold inputs (0.1.5 vocabulary):
 *   - `turn/start`  -> opens turn meta (start seq/time)
 *   - `user/message`-> appends one message entry (seq/time/turn/preview/full text)
 *   - `assistant/message` -> accumulates the turn's token usage and records its
 *     TTFT from the settlement's embedded compact stream
 *   - `assistant/attempt` -> records TTFT for an attempt that settled without a
 *     surface message (failed / retried / cancelled / stream error)
 *   - `turn/end`    -> closes turn meta (end time, end reason)
 *
 * 0.1.5 migration: the standalone `assistant/chunk` event no longer exists —
 * streaming timing now travels inside the settlement events as a compact
 * `stream: AssistantStreamRecord[]`, and the vendor reader
 * `assistantStreamFirstTokenTime` answers TTFT from it without expanding the
 * stream. `stateVersion` was bumped so 0.1.2-era persisted checkpoints are
 * discarded instead of forward-applied.
 *
 * State is plain JSON (persisted-cache precondition) and updates are
 * reference-stable: an apply that changes nothing returns the same state.
 */
import { z } from 'zod'
import {
  SessionSeq,
  type SessionEvent,
  type SessionHeader,
  type SessionLogOffset,
  type TurnEndReason,
} from '@deepseek-ai/dsh-session'
import { assistantStreamFirstTokenTime } from '@deepseek-ai/dsh-llm'
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

/** Preview budget: one tooltip line (matches the rail's 80-char previews). */
export const MESSAGE_PREVIEW_LIMIT = 80

/** One user-message rail mark, addressed by its event seq. */
export interface MilestoneMessageEntry {
  /** Seq of the `user/message` event — the paging/anchoring target. */
  readonly seq: SessionSeq
  /**
   * The `user/message` event's message id. The harness conversation row's
   * `data-chat-anchor-key` is `conversationContextKey('input-message', id)`,
   * so this is what maps a rail mark to its DOM row (see MilestoneRail's
   * `findRow`); the seq alone does NOT appear in the row's attributes.
   */
  readonly messageId: string
  /** Event wall-clock time (ms). */
  readonly time: number
  /** Turn the message belongs to (from the open `turn/start`). */
  readonly turn: number
  /** Bounded preview for hover cards. */
  readonly preview: string
  /** Full message text (in-session search needs it). */
  readonly text: string
}

/** Per-turn performance metadata for the hover card. */
export interface MilestoneTurnMeta {
  readonly turn: number
  readonly startSeq: SessionSeq
  readonly startTime: number
  /** Closed by `turn/end`; absent while the turn is open. */
  readonly endTime?: number
  /** `turn/end` reason; absent while open. */
  readonly endReason?: string
  /** Time of the attempt stream's first token (ms) — TTFT anchor. */
  readonly firstChunkTime?: number
  /**
   * Accumulated `assistant/message` usage across steps. `input` is the FULL
   * billed input (uncached + cache read + cache write), preserving the
   * pre-0.1.5 "prompt tokens" meaning; `total` prefers the provider total and
   * falls back to `input + output`.
   */
  readonly usage?: { readonly input: number; readonly output: number; readonly total: number }
}

/** Fold state (plain JSON; arrays keep JSON compatibility). */
export interface MilestoneMessagesState {
  readonly messages: readonly MilestoneMessageEntry[]
  readonly turns: readonly MilestoneTurnMeta[]
}

/** Client-visible projection view. */
export interface MilestoneMessagesView {
  readonly messages: readonly MilestoneMessageEntry[]
  readonly turns: readonly MilestoneTurnMeta[]
}

const messageEntrySchema = z.object({
  seq: z.number().int().nonnegative().transform(SessionSeq),
  messageId: z.string(),
  time: z.number(),
  turn: z.number().int().nonnegative(),
  preview: z.string().max(MESSAGE_PREVIEW_LIMIT),
  text: z.string(),
})

const turnMetaSchema = z.object({
  turn: z.number().int().nonnegative(),
  startSeq: z.number().int().nonnegative().transform(SessionSeq),
  startTime: z.number(),
  endTime: z.number().optional(),
  endReason: z.string().optional(),
  firstChunkTime: z.number().optional(),
  usage: z.object({
    input: z.number(),
    output: z.number(),
    total: z.number(),
  }).optional(),
})

const milestoneMessagesViewSchema = z.object({
  messages: z.array(messageEntrySchema),
  turns: z.array(turnMetaSchema),
})

/** Space-join text blocks, collapse whitespace, cap at `limit` with an ellipsis. */
export function previewText(content: readonly unknown[], limit: number): string {
  let text = ''
  let unread = false
  for (const block of content as ReadonlyArray<{ type?: string; text?: string }>) {
    if (block.type !== 'text' || typeof block.text !== 'string') continue
    if (text.length >= limit * 2) {
      unread = true
      break
    }
    const chunk = block.text.length > limit * 2 ? block.text.slice(0, limit * 2) : block.text
    text += text === '' ? chunk : ` ${chunk}`
    if (text.length > limit * 2) {
      unread = true
      break
    }
  }
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length > limit - 1) return `${normalized.slice(0, limit - 1).trimEnd()}…`
  return unread ? `${normalized}…` : normalized
}

/** Extract the full plain text of a user message's content blocks. */
export function fullText(content: readonly unknown[]): string {
  const parts: string[] = []
  for (const block of content as ReadonlyArray<{ type?: string; text?: string }>) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
  }
  return parts.join('\n')
}

/**
 * Finite-number read with a zero fallback. Usage payloads read at this fold
 * boundary may predate the 0.1.5 `TokenUsage` rename (a migrated pre-0.1.5 log
 * carries `input`/`output`/`total` instead), so a missing field must degrade to
 * zero rather than poison the accumulated totals with `NaN`.
 */
function finiteOrZero(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** Immutable fold state helper: open-turn bookkeeping lives in the state array tail. */
const EMPTY_MESSAGES: readonly MilestoneMessageEntry[] = Object.freeze([])
const EMPTY_TURNS: readonly MilestoneTurnMeta[] = Object.freeze([])

function initialState(): MilestoneMessagesState {
  return { messages: EMPTY_MESSAGES, turns: EMPTY_TURNS }
}

export const milestoneMessagesProjectionDefinition = {
  key: 'milestone.messages',
  // 2: 0.1.5 fold semantics (embedded stream TTFT; TokenUsage field rename).
  // 3: message entries carry the `user/message` id (DOM anchor mapping).
  stateVersion: 3,
  stateSchema: z.custom<MilestoneMessagesState>(),
  init: (_header: SessionHeader, _inheritedEventCount: SessionLogOffset): MilestoneMessagesState => initialState(),
  apply(state: MilestoneMessagesState, event: SessionEvent): MilestoneMessagesState {
    switch (event.type) {
      case 'turn/start': {
        const turn = event.data.turn
        if (state.turns.some((t) => t.turn === turn)) return state
        return {
          messages: state.messages,
          turns: [...state.turns, { turn, startSeq: SessionSeq(event.seq), startTime: event.time }],
        }
      }
      case 'user/message': {
        const data = event.data as { id?: unknown; content?: readonly unknown[] }
        const content = data.content ?? []
        const text = fullText(content)
        const preview = previewText(content, MESSAGE_PREVIEW_LIMIT)
        const openTurn = state.turns[state.turns.length - 1]
        return {
          messages: [
            ...state.messages,
            {
              seq: SessionSeq(event.seq),
              messageId: typeof data.id === 'string' ? data.id : '',
              time: event.time,
              turn: openTurn?.turn ?? 0,
              preview,
              text,
            },
          ],
          turns: state.turns,
        }
      }
      case 'assistant/message': {
        const turn = event.data.turn
        const index = state.turns.findIndex((t) => t.turn === turn)
        if (index < 0) return state
        const prior = state.turns[index]
        let next = prior
        // 0.1.5: streaming timing travels in the settlement's embedded stream.
        // Guarded: a migrated pre-0.1.5 log carries no `stream` field.
        const stream = event.data.stream
        const firstToken = Array.isArray(stream) ? assistantStreamFirstTokenTime(stream) : undefined
        if (firstToken !== undefined && prior.firstChunkTime === undefined) {
          next = { ...next, firstChunkTime: firstToken }
        }
        const usage = event.data.usage
        if (usage !== undefined) {
          const accumulated = next.usage ?? { input: 0, output: 0, total: 0 }
          // 0.1.5 TokenUsage is disjoint (cached input is reported separately);
          // summing the three restores the pre-0.1.5 "prompt tokens" meaning.
          const input =
            finiteOrZero(usage.inputTokens) +
            finiteOrZero(usage.cacheReadTokens) +
            finiteOrZero(usage.cacheWriteTokens)
          const output = finiteOrZero(usage.outputTokens)
          const total =
            usage.totalTokens === undefined ? input + output : finiteOrZero(usage.totalTokens)
          next = {
            ...next,
            usage: {
              input: accumulated.input + input,
              output: accumulated.output + output,
              total: accumulated.total + total,
            },
          }
        }
        if (next === prior) return state
        const turns = state.turns.slice()
        turns[index] = next
        return { messages: state.messages, turns }
      }
      case 'assistant/attempt': {
        const turn = event.data.turn
        const index = state.turns.findIndex((t) => t.turn === turn)
        if (index < 0 || state.turns[index].firstChunkTime !== undefined) return state
        const stream = event.data.stream
        const firstToken = Array.isArray(stream) ? assistantStreamFirstTokenTime(stream) : undefined
        if (firstToken === undefined) return state
        const turns = state.turns.slice()
        turns[index] = { ...turns[index], firstChunkTime: firstToken }
        return { messages: state.messages, turns }
      }
      case 'turn/end': {
        const turn = event.data.turn
        const index = state.turns.findIndex((t) => t.turn === turn)
        if (index < 0 || state.turns[index].endTime !== undefined) return state
        const turns = state.turns.slice()
        turns[index] = {
          ...turns[index],
          endTime: event.time,
          endReason: (event.data as { reason: TurnEndReason }).reason.kind,
        }
        return { messages: state.messages, turns }
      }
      default:
        return state
    }
  },
  wire: {
    viewSchema: z.custom<MilestoneMessagesView>(),
    view: (state: MilestoneMessagesState) => ({ messages: state.messages, turns: state.turns }),
  },
} satisfies ProjectionDefinition<'milestone.messages', MilestoneMessagesState>

/** Type declaration merge: register the key with the projection registry. */
declare module '@deepseek-ai/dsh-session-projection/types' {
  interface SessionProjectionStateMap {
    'milestone.messages': MilestoneMessagesState
  }
  interface SessionProjectionMap {
    'milestone.messages': MilestoneMessagesView
  }
}