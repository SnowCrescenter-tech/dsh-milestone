/**
 * Component tests for the milestone rail's load-older affordance + window
 * coverage hint (F3): when the session has older messages the rail shows a
 * slim `···` button (top) that triggers the injected `loadOlder` action, a
 * disabled+marked state while `loadingOlder`, and a compact window hint;
 * without `hasMore` neither the button nor the hint renders.
 *
 * `renderRail` builds its snapshot without paging flags (its default
 * `hasMore: false` covers the absence case here), so the two flagged cases
 * render through a local mirror that feeds `buildSnapshot` the flags — the
 * harness scaffold (scrollport + anchor rows + rail) stays identical.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { renderRail } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'
import { buildSnapshot } from '../test/snapshot-fixture.ts'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { zh } from './locales.ts'

const USERS: RailUser[] = [
  { key: '13:user<older-1>', seq: 1, time: 1_700_000_000_000, text: '最早的问题' },
  { key: '13:user<older-2>', seq: 2, time: 1_700_000_060_000, text: '中间的问题' },
  { key: '13:user<older-3>', seq: 3, time: 1_700_000_120_000, text: '最新的问题' },
]

interface PagingFlags {
  readonly hasMore?: boolean
  readonly loadingOlder?: boolean
}

/** Locale interpreter over the zh dictionary (mirrors renderRail's makeT). */
function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    const tpl = dict[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot)) : tpl
  }
}

/**
 * Mirror of `renderRail`'s scaffold that stamps paging flags into the
 * snapshot fixture (renderRail itself cannot express them).
 */
function renderRailFlagged(users: RailUser[], flags: PagingFlags) {
  const snapshot = buildSnapshot({ users, ...flags })
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

function loadOlderButton(): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>('[data-load-older]')
  if (el === null) throw new Error('data-load-older not found')
  return el
}

function windowHint(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-window-hint]')
  if (el === null) throw new Error('data-window-hint not found')
  return el
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MilestoneRail load-older + window coverage (F3)', () => {
  it('with hasMore: shows the load-older button and window hint; clicking loads exactly once', () => {
    const { loadOlder } = renderRailFlagged(USERS, { hasMore: true })

    expect(loadOlderButton()).toBeInTheDocument()
    expect(loadOlderButton()).toHaveAttribute('title', '加载更早消息')
    expect(loadOlderButton()).toHaveAccessibleName('加载更早消息')
    expect(windowHint().textContent).toBe(`已显示 ${USERS.length} 条 · 还有更早`)

    fireEvent.click(loadOlderButton())
    expect(loadOlder).toHaveBeenCalledTimes(1)
  })

  it('with loadingOlder (and hasMore): the button is disabled and carries data-loading-older', () => {
    renderRailFlagged(USERS, { hasMore: true, loadingOlder: true })

    expect(loadOlderButton()).toHaveAttribute('data-loading-older')
    expect(loadOlderButton()).toBeDisabled()
  })

  it('without hasMore: neither the button nor the window hint renders', () => {
    renderRail(USERS)

    expect(document.querySelector('[data-load-older]')).toBeNull()
    expect(document.querySelector('[data-window-hint]')).toBeNull()
  })
})
