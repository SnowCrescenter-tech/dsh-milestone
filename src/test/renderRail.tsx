/**
 * Component-test helper: renders MilestoneRail over a ConversationSnapshot
 * fixture inside the DOM shape the harness provides, so component tests can
 * drive the rail's real DOM (dots, search panel, anchors) without the slot
 * machinery.
 *
 * - `useSession` is stubbed as `(selector) => selector(snapshot)`: every
 *   selector call the component makes re-reads the same frozen snapshot.
 * - A `[data-conversation-scroll]` wrapper holds one `[data-chat-anchor-key]`
 *   row per user message (the anchors `findRow` jumps to) and the rail.
 * - A REAL persisted bookmarks store (createBookmarksStore + defineStore
 *   engine) is created per call over a fresh Map-backed localStorage stub, so
 *   bookmark/keyboard/badge tests drive the genuine engine — persistence is
 *   observable via the returned `backing` Map. `vi.unstubAllGlobals()` remains
 *   the TEST's afterEach responsibility.
 *
 * The rail's real `PropsRuntime<'milestone.rail'>` includes the framework's
 * standard kit and declaration-merge machinery that tests do not construct;
 * per the F1 test spec the props object uses a local structural type with a
 * single cast at the render call (no `any`).
 */
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { SessionSeq } from '@deepseek-ai/dsh-session'
import { MilestoneRail } from '../client/MilestoneRail.tsx'
import type { MilestoneRailProps } from '../client/MilestoneRail.tsx'
import { createBookmarksStore } from '../client/bookmarkStore.ts'
import { zh } from '../client/locales.ts'
import { TOOLBAR_PREFS_KEY } from '../client/toolbar-prefs.ts'
import type { MilestoneMessageEntry, MilestoneMessagesView, MilestoneTurnMeta } from '../projection/milestone-messages'
import { extractText } from '../client/rail-logic.ts'
import type { ConversationSnapshotFixture, FixtureTextBlock } from './snapshot-fixture.ts'
import { buildSnapshot } from './snapshot-fixture.ts'

/** Locale interpreter: looks up `key` in `dict`, falling back to the key; substitutes `{name}` slots from `params`. */
function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    const tpl = dict[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot)) : tpl
  }
}

/** The interpreter shape passed to the rail (and overridable per render). */
export type TInterp = (key: string, params?: Record<string, string | number>) => string

export interface RailUser {
  key: string
  seq: number
  time: number
  text: string
}

/**
 * Structural stand-in for the session standard kit the rail consumes, plus the
 * persisted bookmarks store surface (`useStore` selector + store actions) the
 * upcoming bookmark/keyboard/badge tests drive.
 */
export interface RailTestProps {
  useSession: (selector: (snapshot: ConversationSnapshotFixture) => unknown) => unknown
  sessionId: string
  useProjection: (key?: string) => unknown
  loadOlder: () => Promise<void>
  useStore: (selector: (snap: { keys: string[] }) => unknown) => unknown
  actions: { toggle: (key: string) => void; clear: () => void }
  t: TInterp
  forkAt: (atSeq: number) => Promise<string>
  /** P3 cross-session search action: harness `sessions.search` unwrapped to hits + hasMore. */
  searchSessions: (query: string, signal: AbortSignal) => Promise<{ items: SessionSearchHit[]; hasMore: boolean }>
  /** P3 cross-session open action: select the clicked session as current. */
  openSession: (id: string) => void
}

/** One cross-session search hit the rail renders (title joined by railInject). */
export interface SessionSearchHit {
  sessionId: string
  snippet: string
  title?: string
}

/** Full Storage surface (getItem/setItem/removeItem/clear/key/length) over a Map. */
function createStorage(backing: Map<string, string>): Storage {
  return {
    get length() {
      return backing.size
    },
    clear: () => {
      backing.clear()
    },
    getItem: (k: string) => backing.get(k) ?? null,
    key: (index: number) => [...backing.keys()][index] ?? null,
    removeItem: (k: string) => {
      backing.delete(k)
    },
    setItem: (k: string, v: string) => {
      backing.set(k, v)
    },
  }
}

/**
 * 0.1.2: derive the `milestone.messages` projection view from the legacy
 * fixture snapshot — the rail now reads conversation content exclusively
 * through `useProjection('milestone.messages')`; `useSession` carries the
 * lifecycle fields only.
 */
export function projectionFromSnapshot(snapshot: ConversationSnapshotFixture): MilestoneMessagesView {
  const messages: MilestoneMessageEntry[] = []
  const turns: MilestoneTurnMeta[] = []
  const turnSeen = new Set<number>()
  for (const key of snapshot.chat.order) {
    const node = snapshot.chat.nodes.get(key)
    if (node === undefined || node.kind !== 'user') continue
    const data = node.data as { seq: number; time: number; content: readonly FixtureTextBlock[] }
    const turn = node.location.turn.turn
    const text = extractText(data.content)
    messages.push({
      seq: SessionSeq(data.seq),
      messageId: `msg-${data.seq}`,
      time: data.time,
      turn,
      preview: text.slice(0, 80),
      text,
    })
    if (!turnSeen.has(turn)) {
      turnSeen.add(turn)
      turns.push({ turn, startSeq: SessionSeq(data.seq), startTime: data.time })
    }
  }
  return { messages, turns }
}

/**
 * Render the rail over a fixture conversation.
 * @param users - user messages in conversation order (one mark + one anchor
 *   row each); the `text` is the full message body (search matches on it).
 * @param opts.bookmarks - bookmark keys to pre-seed into the real store (each
 *   is toggled on via `store.actions.toggle` before render).
 * @returns the snapshot, the loadOlder mock, the real bookmarks store
 *   (`store`/`actions`) and its `backing` Map (persisted JSON assertions), and
 *   testing-library's render result (`container` for scoped queries).
 */
export function renderRail(
  users: RailUser[],
  opts?: {
    bookmarks?: string[]
    t?: TInterp
    forkAt?: (atSeq: number) => Promise<string>
    searchSessions?: (query: string, signal: AbortSignal) => Promise<{ items: SessionSearchHit[]; hasMore: boolean }>
    openSession?: (id: string) => void
    /**
     * Render the chat rows with the REAL harness anchor format —
     * `data-chat-anchor-key = '13:input-message' + messageId` — instead of the
     * legacy `String(seq)`. Exercises `findRow`'s message-id suffix matching.
     */
    harnessAnchors?: boolean
    /**
     * Toolbar-prefs seed (`dsh-milestone.toolbar`) written to localStorage
     * BEFORE the rail mounts, so its `useState(loadPrefs)` initializer
     * hydrates from it — lets tests seed `ballMode` / `ball`.
     */
    prefs?: Record<string, unknown>
  },
) {
  const snapshot = buildSnapshot({ users })
  const projection = projectionFromSnapshot(snapshot)
  // 0.1.2: useSession exposes lifecycle state; the fixture's legacy `pending`
  // array is mapped onto the new `queue` field the rail reads for awaitingInput.
  const useSession: RailTestProps['useSession'] = (selector) => selector({ ...snapshot, queue: snapshot.pending })
  const loadOlder = vi.fn(async () => {})
  const useProjection: RailTestProps['useProjection'] = (key) =>
    key === 'milestone.messages' ? projection : undefined
  const t: TInterp = opts?.t ?? makeT(zh as Record<string, string>)
  const forkAt = opts?.forkAt ?? vi.fn(async () => 'child-id')
  // P3: cross-session search defaults to an empty ok result; openSession
  // records calls. Tests override both through opts.
  const searchSessions = opts?.searchSessions ?? vi.fn(async () => ({ items: [], hasMore: false }))
  const openSession = opts?.openSession ?? vi.fn()

  const backing = new Map<string, string>()
  vi.stubGlobal('localStorage', createStorage(backing))
  // Optional prefs seed: written before render so the rail's
  // `useState(loadPrefs)` initializer hydrates from it.
  if (opts?.prefs !== undefined) {
    backing.set(TOOLBAR_PREFS_KEY, JSON.stringify(opts.prefs))
  }
  // scopeKey must match the sessionId prop so the persist key is
  // `dsh-milestone.bookmarks.fixture` (the engine reads localStorage at create).
  const store = createBookmarksStore().create('fixture')
  for (const key of opts?.bookmarks ?? []) {
    store.actions.toggle(key)
  }

  const useStore: RailTestProps['useStore'] = (selector) => selector(store.getSnapshot())
  const actions: RailTestProps['actions'] = store.actions

  const props = {
    useSession,
    sessionId: 'fixture',
    useProjection,
    loadOlder,
    useStore,
    actions,
    t,
    forkAt,
    searchSessions,
    openSession,
  } as unknown as MilestoneRailProps

  const result = render(
    <div data-conversation-scroll>
      <div style={{ height: 400 }}>
        {users.map((user) => (
          // 0.1.2: rail marks are keyed by the message's event seq string, so
          // the anchor rows must carry `data-chat-anchor-key` = seq as well.
          <div
            key={user.key}
            data-chat-anchor-key={opts?.harnessAnchors ? `13:input-messagemsg-${user.seq}` : String(user.seq)}
            style={{ height: 48 }}
          >
            {user.text}
          </div>
        ))}
      </div>
      <MilestoneRail {...props} />
    </div>,
  )

  return { ...result, snapshot, loadOlder, store, actions, backing, forkAt, searchSessions, openSession }
}
