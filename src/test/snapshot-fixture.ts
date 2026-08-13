/**
 * Snapshot fixture builder for dsh-milestone component tests.
 *
 * Mirrors the harness `ConversationSnapshot` contract structurally
 * (packages/client/runtime/src/client/sessions/conversation.ts): the fields
 * MilestoneRail reads — `chat.order`, `chat.nodes.get(key)` (kind/data/
 * location), `chat.timeline.turns` — plus every other contract field with
 * inert defaults, so a built fixture can be fed straight into a `useSession`
 * selector stub (`useSession = (sel) => sel(buildSnapshot(...))`).
 *
 * The real harness types carry brand/registry dependencies that do not ship
 * with this plugin (dsh-session, dsh-llm, ...), so this module defines its own
 * structural view of the contract and keeps payloads loosely typed. This is
 * test-fixture code: casts that would otherwise be forbidden are fine here.
 */

/** One text content block, as MilestoneRail's extractPreview expects. */
export interface FixtureTextBlock {
  type: 'text'
  text: string
}

/** One node in the Map-backed chat node store (any kind, loosely typed). */
export interface FixtureNode {
  key: string
  kind: string
  id: string
  target: 'chat'
  anchorSeq: number
  /** turn carried inline so the component can read `location.turn.turn`. */
  location: { kind: 'turn'; turn: { turn: number } }
  visibility: 'visible'
  /** Loose payload — the shape varies by node kind. */
  data: unknown
}

/** A user message node (the tightest shape MilestoneRail reads). */
export interface FixtureUserNode extends FixtureNode {
  kind: 'user'
  data: { seq: number; time: number; content: readonly FixtureTextBlock[] }
}

/** Map-backed chat node store (mirrors the harness ChatNodeStore contract). */
export interface FixtureNodeStore {
  get(key: string): FixtureNode | undefined
  values(): readonly FixtureNode[]
}

/** Structural mirror of the harness ConversationSnapshot. */
export interface ConversationSnapshotFixture {
  sessionId: string
  views: { get(): undefined }
  chat: {
    order: readonly string[]
    nodes: FixtureNodeStore
    locations: { getTurn(): readonly string[]; getStep(): readonly string[] }
    timeline: { turnOrder: readonly number[]; turns: ReadonlyMap<number, unknown> }
    legacy: {
      nodes: readonly { kind: 'user'; seq: number; time: number; content: readonly FixtureTextBlock[]; source: null }[]
      turnTimings: ReadonlyMap<number, unknown>
      turnEnds: ReadonlyMap<number, number>
      partial: null
      runningCalls: readonly unknown[]
    }
  }
  nodes: readonly { kind: 'user'; seq: number; time: number; content: readonly FixtureTextBlock[]; source: null }[]
  turnTimings: ReadonlyMap<number, unknown>
  turnEnds: ReadonlyMap<number, number>
  partial: Readonly<{ content: readonly FixtureTextBlock[] }> | null
  runningCalls: readonly unknown[]
  pending: readonly unknown[]
  queue: readonly unknown[]
  running: boolean
  subagent: null
  composerPhase: 'blank' | 'engaging' | 'active'
  removed: boolean
  openState: 'cold' | 'loading' | 'open' | 'error'
  openError: null
  hasMore: boolean
  loadingOlder: boolean
  promptError: null
  blank: boolean
  lastAgentError: string | null
}

export interface BuildSnapshotOptions {
  users?: { key: string; seq: number; time: number; text: string }[]
  hasMore?: boolean
  loadingOlder?: boolean
  /** Extra chat nodes (turn-error / turn-max-tokens / model-retry) appended to order + store. */
  nodes?: { key: string; kind: string; turn: number; retryState?: string }[]
  /** Stamp a non-empty `pending` array. */
  pending?: boolean
  /** Stamp `running` = true. */
  running?: boolean
  /** Stamp a non-null `partial` payload. */
  partial?: boolean
}

/** Default two-user conversation so a bare call already yields ≥2 marks. */
const DEFAULT_USERS = [
  { key: '13:user<msg-1>', seq: 1, time: 1_700_000_000_000, text: '帮我优化这段代码的性能' },
  { key: '13:user<msg-2>', seq: 2, time: 1_700_000_060_000, text: '再检查一下边界条件' },
]

function makeNodeStore(nodes: readonly FixtureNode[]): FixtureNodeStore {
  const map = new Map(nodes.map((node) => [node.key, node]))
  return {
    get: (key: string) => map.get(key),
    values: () => [...map.values()],
  }
}

/**
 * Build a full ConversationSnapshot-shaped fixture.
 * @param opts - user messages and paging flags (all optional; see defaults).
 * @returns structural snapshot ready for `useSession` selector stubs.
 */
export function buildSnapshot(opts: BuildSnapshotOptions = {}): ConversationSnapshotFixture {
  const users = opts.users ?? DEFAULT_USERS
  const extraNodes = opts.nodes ?? []
  const chatNodes: FixtureNode[] = [
    ...users.map((user, i) => ({
      key: user.key,
      kind: 'user' as const,
      id: user.key,
      target: 'chat' as const,
      anchorSeq: user.seq,
      location: { kind: 'turn' as const, turn: { turn: i + 1 } },
      visibility: 'visible' as const,
      data: { seq: user.seq, time: user.time, content: [{ type: 'text' as const, text: user.text }] },
    })),
    ...extraNodes.map((extra) => ({
      key: extra.key,
      kind: extra.kind,
      id: extra.key,
      target: 'chat' as const,
      anchorSeq: extra.turn,
      location: { kind: 'turn' as const, turn: { turn: extra.turn } },
      visibility: 'visible' as const,
      data: extra.retryState === undefined ? {} : { retryState: extra.retryState },
    })),
  ]
  const legacyNodes = users.map((user) => ({
    kind: 'user' as const,
    seq: user.seq,
    time: user.time,
    content: [{ type: 'text' as const, text: user.text }],
    source: null,
  }))
  return {
    sessionId: 'fixture-session',
    views: { get: () => undefined },
    chat: {
      order: [...users.map((user) => user.key), ...extraNodes.map((extra) => extra.key)],
      nodes: makeNodeStore(chatNodes),
      locations: { getTurn: () => [], getStep: () => [] },
      timeline: { turnOrder: users.map((_, i) => i + 1), turns: new Map() },
      legacy: {
        nodes: legacyNodes,
        turnTimings: new Map(),
        turnEnds: new Map(),
        partial: null,
        runningCalls: [],
      },
    },
    nodes: legacyNodes,
    turnTimings: new Map(),
    turnEnds: new Map(),
    partial: opts.partial ? { content: [{ type: 'text' as const, text: 'fixture-partial' }] } : null,
    runningCalls: [],
    pending: opts.pending ? [{ key: 'fixture-pending' }] : [],
    queue: [],
    running: opts.running ?? false,
    subagent: null,
    composerPhase: 'active',
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: opts.hasMore ?? false,
    loadingOlder: opts.loadingOlder ?? false,
    promptError: null,
    blank: false,
    lastAgentError: null,
  }
}
