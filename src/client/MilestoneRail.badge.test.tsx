/**
 * Component tests for the milestone rail's status badges (F4): each dot's ring
 * must carry `data-badge="<kind>"` (kind ∈ error | max-tokens | retry |
 * running | awaiting), derived per mark via `deriveBadge`
 * (src/client/badge-logic.ts).
 *
 * 0.1.2 contract asserted here:
 * - Durable kinds (error / max-tokens / retry) came from chat nodes stamped on
 *   a specific turn (`turn-error` / `turn-max-tokens` / `model-retry`). The
 *   0.1.2 event layer no longer carries those node kinds — the fold only sees
 *   `turn`/`end` reasons — so `kindsByTurn` is constant empty and a durable
 *   badge NEVER renders, even when a legacy-shaped node is stamped on the
 *   fixture (regression guard for the migration).
 * - Transient kinds (running / awaiting) come from the session flags
 *   (`running` / non-empty `pending`, read through the new `queue` lifecycle
 *   field) and target ONLY the last mark.
 * - Remaining precedence (transient pair): running > awaiting.
 *
 * `renderRail` builds its snapshot with just `users` (no `nodes`/`running`/
 * `pending` options), so the flagged cases render through a local mirror that
 * feeds `buildSnapshot` the badge-relevant options directly and injects the
 * `milestone.messages` projection the same way `renderRail` does — the
 * harness scaffold (scrollport + anchor rows + rail) stays identical.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { RailUser } from '../test/renderRail.tsx'
import { projectionFromSnapshot } from '../test/renderRail.tsx'
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
 * into the snapshot fixture (renderRail itself cannot express them) and
 * injects the 0.1.2 `milestone.messages` projection the same way.
 */
function renderBadge(users: RailUser[], opts: BadgeOptions = {}) {
  const snapshot = buildSnapshot({ users, nodes: opts.nodes, running: opts.running, pending: opts.pending })
  const projection = projectionFromSnapshot(snapshot)
  // 0.1.2: useSession exposes lifecycle state only; the fixture's legacy
  // `pending` array maps onto the new `queue` field the rail reads for
  // awaitingInput.
  const useSession = (selector: (snap: ConversationSnapshotFixture) => unknown) =>
    selector({ ...snapshot, queue: snapshot.pending })
  const loadOlder = vi.fn(async () => {})
  const props = {
    useSession,
    sessionId: 'fixture',
    useProjection: (key?: string) => (key === 'milestone.messages' ? projection : undefined),
    loadOlder,
    t: makeT(zh as Record<string, string>),
  } as unknown as MilestoneRailProps

  const result = render(
    <div data-conversation-scroll>
      <div style={{ height: 400 }}>
        {users.map((user) => (
          // 0.1.2: anchor rows are keyed by the message's event seq string.
          <div key={user.key} data-chat-anchor-key={String(user.seq)} style={{ height: 48 }}>
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

describe('MilestoneRail status badges (F4, 0.1.2)', () => {
  it('turn-error node on turn 1 -> no dot carries data-badge="error" (0.1.2: kindsByTurn is empty)', () => {
    renderBadge(USERS, { nodes: [{ key: '13:turn-error<node-1>', kind: 'turn-error', turn: 1 }] })

    // 0.1.2: the event layer no longer carries turn-error nodes (the fold only
    // sees turn/end reasons), so the durable error badge never renders.
    expect(badgeOf(1)).toBeNull()
    expect(badgeOf(2)).toBeNull()
    expect(badgeOf(3)).toBeNull()
  })

  it('turn-max-tokens node on turn 1 -> no dot carries data-badge="max-tokens" (0.1.2: kindsByTurn is empty)', () => {
    renderBadge(USERS, { nodes: [{ key: '13:turn-max-tokens<node-1>', kind: 'turn-max-tokens', turn: 1 }] })

    // 0.1.2: turn-max-tokens nodes are gone from the event layer, so the
    // durable max-tokens badge never renders.
    expect(badgeOf(1)).toBeNull()
    expect(badgeOf(2)).toBeNull()
    expect(badgeOf(3)).toBeNull()
  })

  it('model-retry node (retryState scheduled) on turn 1 -> no dot carries data-badge="retry" (0.1.2: kindsByTurn is empty)', () => {
    renderBadge(USERS, {
      nodes: [{ key: '13:model-retry<node-1>', kind: 'model-retry', turn: 1, retryState: 'scheduled' }],
    })

    // 0.1.2: model-retry nodes are gone from the event layer, so the durable
    // retry badge never renders (retryState is irrelevant).
    expect(badgeOf(1)).toBeNull()
    expect(badgeOf(2)).toBeNull()
    expect(badgeOf(3)).toBeNull()
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

  it('precedence: running with pending -> only the last dot wears "running" (running > awaiting)', () => {
    // 0.1.2: the durable badge kinds are gone, so the only remaining
    // precedence pair is the transient running > awaiting on the newest mark.
    renderBadge(USERS, { running: true, pending: true })

    expect(badgeOf(1)).toBeNull()
    expect(badgeOf(USERS.length - 1)).toBeNull()
    expect(badgeOf(USERS.length)).toBe('running')
  })
})
