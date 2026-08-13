/**
 * RED component tests for the milestone rail's richer hover-tooltip metadata
 * (C2): the tooltip shows which model answered the turn, the request purpose,
 * and the token usage, all derived from the turn's `assistant-step` node
 * (`data.finalNode.usage` / `provenance` / `requestConfig`).
 *
 * The feature is NOT implemented yet — `HoverInfo` carries no model/purpose/
 * token labels and the tooltip renders no metadata row. These tests assert the
 * data contract the implementation WILL ship and therefore FAIL for the right
 * reason: the `data-model` / `data-purpose` / `data-tokens` spans are missing
 * from the rendered tooltip DOM.
 *
 * Contract asserted:
 *   - hovering a dot whose turn has assistant-step metadata renders a metadata
 *     row whose spans carry `data-model` (the requestConfig/provenance model),
 *     `data-purpose` (the requestConfig purpose), and `data-tokens`
 *     (`"<input> / <output> tok"` when BOTH token counts are known)
 *   - hovering a dot whose turn has NO assistant metadata renders NO metadata
 *     row — all three `data-*` spans stay absent
 *
 * renderRail (src/test/renderRail.tsx) only feeds user messages into the
 * snapshot, so this file mirrors its scaffold with a local renderTooltip
 * helper that also passes `assistants` / `trajectory` / `userTurns` into
 * buildSnapshot.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { zh } from './locales.ts'
import type {
  ConversationSnapshotFixture,
  FixtureAssistant,
  FixtureTrajectoryView,
} from '../test/snapshot-fixture.ts'
import { buildSnapshot } from '../test/snapshot-fixture.ts'

/** Locale interpreter mirroring renderRail's: dictionary lookup with `{name}` slot substitution. */
function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    const tpl = dict[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot)) : tpl
  }
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

interface TooltipUser {
  key: string
  seq: number
  time: number
  text: string
}

interface RenderTooltipOptions {
  users: TooltipUser[]
  userTurns?: number[]
  assistants?: FixtureAssistant[]
  trajectory?: FixtureTrajectoryView
}

/**
 * Render the rail over a snapshot built from users + assistant-step stamps +
 * the trajectory view — the same scaffold as renderRail, extended with the
 * metadata sources the tooltip reads.
 */
function renderTooltip(opts: RenderTooltipOptions) {
  const snapshot = buildSnapshot({
    users: opts.users,
    userTurns: opts.userTurns,
    assistants: opts.assistants,
    trajectory: opts.trajectory,
  })
  const useSession: (selector: (s: ConversationSnapshotFixture) => unknown) => unknown = (selector) =>
    selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const forkAt = vi.fn(async () => 'child-id')

  const backing = new Map<string, string>()
  vi.stubGlobal('localStorage', createStorage(backing))
  const store = createBookmarksStore().create('fixture')

  const props = {
    useSession,
    sessionId: 'fixture',
    useProjection: () => undefined,
    loadOlder,
    useStore: (selector: (s: { keys: string[] }) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    t: makeT(zh as Record<string, string>),
    forkAt,
  } as unknown as MilestoneRailProps

  const result = render(
    <div data-conversation-scroll>
      <div style={{ height: 400 }}>
        {opts.users.map((user) => (
          <div key={user.key} data-chat-anchor-key={user.key} style={{ height: 48 }}>
            {user.text}
          </div>
        ))}
      </div>
      <MilestoneRail {...props} />
    </div>,
  )

  return { ...result, snapshot }
}

const USERS: TooltipUser[] = [
  { key: '13:user<tt-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<tt-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** The metadata span carrying `data-<attr>`; throws when absent (clear failure reason). */
function metaSpan(attr: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-${attr}]`)
  if (el === null) throw new Error(`[data-${attr}] not found in tooltip`)
  return el
}

describe('MilestoneRail tooltip metadata', () => {
  it('shows model / purpose / token usage for a turn with assistant-step metadata', () => {
    renderTooltip({
      users: USERS,
      assistants: [
        {
          key: '13:assistant<tt-1>',
          turn: 1,
          usage: { inputTokens: 100, outputTokens: 50 },
          provenance: { provider: 'deepseek', model: 'v4' },
          requestConfig: { provider: 'deepseek', model: 'v4', purpose: 'continue' },
        },
      ],
    })

    fireEvent.mouseEnter(screen.getByRole('button', { name: '跳转到第 1 条消息' }))

    expect(metaSpan('model')).toHaveAttribute('data-model', 'v4')
    expect(metaSpan('purpose')).toHaveAttribute('data-purpose', 'continue')
    expect(metaSpan('tokens')).toHaveAttribute('data-tokens', '100 / 50 tok')
  })

  it('renders no metadata row when the turn has no assistant metadata', () => {
    renderTooltip({ users: USERS })

    fireEvent.mouseEnter(screen.getByRole('button', { name: '跳转到第 1 条消息' }))

    expect(document.querySelector('[data-model]')).toBeNull()
    expect(document.querySelector('[data-purpose]')).toBeNull()
    expect(document.querySelector('[data-tokens]')).toBeNull()
  })
})
