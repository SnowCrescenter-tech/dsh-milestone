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
 * Fold inputs:
 *   - `turn/start`  -> opens turn meta (start seq/time)
 *   - `user/message`-> appends one message entry (seq/time/turn/preview/full text)
 *   - `assistant/chunk` -> records the turn's first-chunk time (TTFT)
 *   - `assistant/message` -> accumulates the turn's token usage
 *   - `turn/end`    -> closes turn meta (end time, end reason)
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
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection'

/** Preview budget: one tooltip line (matches the rail's 80-char previews). */
export const MESSAGE_PREVIEW_LIMIT = 80

/** One user-message rail mark, addressed by its event seq. */
export interface MilestoneMessageEntry {
  /** Seq of the `user/message` event — the paging/anchoring target. */
  readonly seq: SessionSeq
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
  /** First `assistant/chunk` arrival (ms) — TTFT anchor. */
  readonly firstChunkTime?: number
  /** Accumulated `assistant/message` usage across steps. */
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

/** Immutable fold state helper: open-turn bookkeeping lives in the state array tail. */
const EMPTY_MESSAGES: readonly MilestoneMessageEntry[] = Object.freeze([])
const EMPTY_TURNS: readonly MilestoneTurnMeta[] = Object.freeze([])

function initialState(): MilestoneMessagesState {
  return { messages: EMPTY_MESSAGES, turns: EMPTY_TURNS }
}

export const milestoneMessagesProjectionDefinition = {
  key: 'milestone.messages',
  stateVersion: 1,
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
        const content = (event.data as { content?: readonly unknown[] }).content ?? []
        const text = fullText(content)
        const preview = previewText(content, MESSAGE_PREVIEW_LIMIT)
        const openTurn = state.turns[state.turns.length - 1]
        return {
          messages: [
            ...state.messages,
            {
              seq: SessionSeq(event.seq),
              time: event.time,
              turn: openTurn?.turn ?? 0,
              preview,
              text,
            },
          ],
          turns: state.turns,
        }
      }
      case 'assistant/chunk': {
        const turn = event.data.turn
        const index = state.turns.findIndex((t) => t.turn === turn)
        if (index < 0 || state.turns[index].firstChunkTime !== undefined) return state
        const turns = state.turns.slice()
        turns[index] = { ...turns[index], firstChunkTime: event.time }
        return { messages: state.messages, turns }
      }
      case 'assistant/message': {
        const turn = event.data.turn
        const index = state.turns.findIndex((t) => t.turn === turn)
        if (index < 0) return state
        const usage = (event.data as { usage?: { input?: number; output?: number; total?: number } }).usage
        if (!usage) return state
        const prior = state.turns[index].usage ?? { input: 0, output: 0, total: 0 }
        const turns = state.turns.slice()
        turns[index] = {
          ...turns[index],
          usage: {
            input: prior.input + (usage.input ?? 0),
            output: prior.output + (usage.output ?? 0),
            total: prior.total + (usage.total ?? 0),
          },
        }
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