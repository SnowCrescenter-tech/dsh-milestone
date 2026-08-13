/**
 * RED component tests for the milestone rail's turn-health status badges
 * (F4, NOT implemented yet): each dot's ring must carry
 * `data-badge="<kind>"` (kind ∈ error | max-tokens | retry | running |
 * awaiting), derived per mark via `deriveBadge` (src/client/badge-logic.ts).
 *
 * Contract asserted here:
 * - Durable kinds (error / max-tokens / retry) come from chat nodes stamped on
 *   a specific turn (`turn-error` / `turn-max-tokens` / `model-retry`) and are
 *   turn-scoped: the badge lands on the mark whose turn the node sits on.
 * - Transient kinds (running / awaiting) come from the session flags
 *   (`running` / non-empty `pending`) and target ONLY the last mark.
 * - Precedence: error > max-tokens > retry > running > awaiting.
 *
 * `renderRail` builds its snapshot with just `users` (no `nodes`/`running`/
 * `pending` options), so the flagged cases render through a local mirror that
 * feeds `buildSnapshot` the badge-relevant options directly — the harness
 * scaffold (scrollport + anchor rows + rail) stays identical, same as the
 * load-older tests' local helper.
 *
 * The feature does not exist yet, so every `[data-badge]` lookup is empty and
 * all tests below FAIL — for the right reason (missing `data-badge`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { RailUser } from '../test/renderRail.tsx'
import { buildSnapshot } from '../test/snapshot-fixture.ts'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { zh } from './locales.ts'

const USERS: RailUser[] = [
  { key: '13:user<badge-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<badge-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
  { key: '13:user<badge-3>', seq: 3, time: 1_700_000_120_000, text: '第三条消息' },
]

/** Badge-relevant snapshot flags: extra turn-scoped nodes + session flags. */
interface BadgeOptions {
  readonly nodes?: { key: string; kind: string; turn: number; retryState?: string }[]
  readonly running?: boolean
  readonly pending?: boolean
}

/** Locale interpreter over the zh dictionary (mirrors renderRail's makeT). */
function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    const tpl = dict[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot)) : tpl
  }
}

/**
 * Mirror of `renderRail`'s scaffold that stamps the badge-relevant options
 * into the snapshot fixture (renderRail itself cannot express them).
 */
function renderBadge(users: RailUser[], opts: BadgeOptions = {}) {
  const snapshot = buildSnapshot({ users, nodes: opts.nodes, running: opts.running, pending: opts.pending })
  const useSession = (selector: (snap: ConversationSnapshotFixture) => unknown) => selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const props = {
    useSession,
    sessionId: 'fixture',
    useProjection: () => undefined,
    loadOlder,
    t: makeT(zh as Record<string, string>),
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

  return { ...result, snapshot, loadOlder }
}

/** The nth dot button (1-based, matching its hover "跳转到第 N 条消息" label). */
function dot(n: number): HTMLElement {
  return screen.getByRole('button', { name: `跳转到第 ${n} 条消息` })
}

/**
 * The badge kind carried by dot n's ring (a `[data-badge]` descendant of the
 * dot's hit area — the inner span or a sibling ring span), or null when the
 * dot wears no badge.
 */
function badgeOf(n: number): string | null {
  return dot(n).querySelector('[data-badge]')?.getAttribute('data-badge') ?? null
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MilestoneRail status badges (F4, RED — feature not implemented)', () => {
  it('turn-error node on turn 1 -> dot 1 carries data-badge="error"', () => {
    renderBadge(USERS, { nodes: [{ key: '13:turn-error<node-1>', kind: 'turn-error', turn: 1 }] })

    expect(badgeOf(1)).toBe('error')
  })

  it('turn-max-tokens node on turn 1 -> dot 1 carries data-badge="max-tokens"', () => {
    renderBadge(USERS, { nodes: [{ key: '13:turn-max-tokens<node-1>', kind: 'turn-max-tokens', turn: 1 }] })

    expect(badgeOf(1)).toBe('max-tokens')
  })

  it('model-retry node (retryState scheduled) on turn 1 -> dot 1 carries data-badge="retry"', () => {
    renderBadge(USERS, {
      nodes: [{ key: '13:model-retry<node-1>', kind: 'model-retry', turn: 1, retryState: 'scheduled' }],
    })

    expect(badgeOf(1)).toBe('retry')
  })

  it('running:true -> only the last dot carries data-badge="running"', () => {
    renderBadge(USERS, { running: true })

    expect(badgeOf(USERS.length)).toBe('running')
    expect(badgeOf(USERS.length - 1)).toBeNull()
  })

  it('pending:true -> only the last dot carries data-badge="awaiting"', () => {
    renderBadge(USERS, { pending: true })

    expect(badgeOf(USERS.length)).toBe('awaiting')
    expect(badgeOf(USERS.length - 1)).toBeNull()
  })

  it('precedence: turn-error on turn 1 with running:true -> dot 1 "error", last dot "running"', () => {
    renderBadge(USERS, {
      nodes: [{ key: '13:turn-error<node-1>', kind: 'turn-error', turn: 1 }],
      running: true,
    })

    expect(badgeOf(1)).toBe('error')
    expect(badgeOf(USERS.length)).toBe('running')
  })
})
