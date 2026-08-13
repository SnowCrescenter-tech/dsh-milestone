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
import { MilestoneRail } from '../client/MilestoneRail.tsx'
import type { MilestoneRailProps } from '../client/MilestoneRail.tsx'
import { createBookmarksStore } from '../client/bookmarkStore.ts'
import { zh } from '../client/locales.ts'
import type { ConversationSnapshotFixture } from './snapshot-fixture.ts'
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
  opts?: { bookmarks?: string[]; t?: TInterp; forkAt?: (atSeq: number) => Promise<string> },
) {
  const snapshot = buildSnapshot({ users })
  const useSession: RailTestProps['useSession'] = (selector) => selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const useProjection: RailTestProps['useProjection'] = () => undefined
  const t: TInterp = opts?.t ?? makeT(zh as Record<string, string>)
  const forkAt = opts?.forkAt ?? vi.fn(async () => 'child-id')

  const backing = new Map<string, string>()
  vi.stubGlobal('localStorage', createStorage(backing))
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
  } as unknown as MilestoneRailProps

  const result = render(
    <div data-conversation-scroll>
      <div style={{ height: 400 }}>
        {users.map((user) => (
          <div key={user.key} data-chat-anchor-key={user.key} style={{ height: 48 }}>
            {user.text}
          </div>
        ))}
      </div>
      <MilestoneRail {...props} />
    </div>,
  )

  return { ...result, snapshot, loadOlder, store, actions, backing, forkAt }
}
