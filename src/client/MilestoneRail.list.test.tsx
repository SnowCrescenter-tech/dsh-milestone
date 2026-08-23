/**
 * Component tests for the milestone rail's expandable all-prompts list panel
 * (P3): the rail-top list toggle opens a fixed panel listing EVERY user-prompt
 * milestone (序号 + turn + preview), and clicking an entry jumps to that
 * message through the SAME `jump` path the rail dots use (scrollIntoView on
 * the `[data-chat-anchor-key]` row). Escape, re-clicking the toggle, or a
 * pointerdown OUTSIDE the panel closes it (the rail feeds a real onClose to
 * the shared useOutsideDismiss contract); the sibling toggles (bookmarks /
 * focus / search) stay intact.
 *
 * P3 (0.6.6): opening the list drains EVERY older page (loadOlder until
 * hasMore is false) so the panel covers the whole session — pinned by a live
 * snapshot harness (renderLiveRail) that re-renders the rail after each page
 * fetch, mirroring the harness uSES subscription.
 *
 * DOM contract pinned here:
 *   - `[data-list-toggle]`            the toggle button (aria-pressed).
 *   - `[data-milestone-list]`         the panel root.
 *   - `[data-list-item]`              one row per mark (data-jump-key).
 *   - `[data-list-loading]`           the drain loading hint row.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render as renderUi, screen, waitFor } from '@testing-library/react'
import { useMemo, useRef, useState } from 'react'
import { MilestoneListPanel } from './MilestoneListPanel.tsx'
import { zh } from './locales.ts'
import { renderRail as renderRailImpl } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { buildSnapshot } from '../test/snapshot-fixture.ts'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** Locale interpreter mirroring renderRail's: dictionary lookup with `{name}` slot substitution. */
function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, unknown>) => {
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

/** 3 users -> 3 marks -> 3 panel entries, one anchor row each. */
const USERS: RailUser[] = [
  { key: '13:user<list-1>', seq: 1, time: 1_700_000_000_000, text: '第一个问题：如何优化构建速度' },
  { key: '13:user<list-2>', seq: 2, time: 1_700_000_060_000, text: '第二个问题：如何减少内存占用' },
  { key: '13:user<list-3>', seq: 3, time: 1_700_000_120_000, text: '第三个问题：如何加速冷启动' },
]

function render(users: RailUser[] = USERS) {
  return renderRailImpl(users)
}

/** B1: the toolbar defaults COLLAPSED — expand it to reveal the list toggle. */
function expandToolbar() {
  const btn = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (btn === null) throw new Error('data-toolbar-expand not found')
  fireEvent.click(btn)
}

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: '打开列表' })
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-milestone-list]')
}

function items(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-list-item]')]
}

/** MilestoneListPanel's `ListMark` slice — panel-level dismissal tests. */
const PANEL_MARKS = [
  { key: '13:user<panel-1>', turn: 1, seq: 1, preview: '第一个问题：如何优化构建速度' },
  { key: '13:user<panel-2>', turn: 2, seq: 2, preview: '第二个问题：如何减少内存占用' },
]

/** Render the panel directly with the rail-fed props plus a dismissal mock. */
function renderPanel(onClose = () => {}) {
  return renderUi(
    <MilestoneListPanel
      panelTop={0}
      panelRight={0}
      marks={PANEL_MARKS}
      onJump={vi.fn()}
      onClose={onClose}
      t={makeT(zh as Record<string, string>)}
    />,
  )
}

/**
 * LIVE snapshot harness for the list-drain contract: the snapshot lives in
 * React state and `loadOlder` appends one OLDER page (older pages first) then
 * flips `hasMore`, re-rendering the rail — mirroring the harness uSES
 * subscription the drain effect depends on. `loadOlder` is stable (useMemo),
 * so the drain effect never restarts mid-flight.
 */
function renderLiveRail(users: RailUser[], olderPages: RailUser[][]) {
  const olderAll = olderPages.flat()
  const backing = new Map<string, string>()
  vi.stubGlobal('localStorage', createStorage(backing))
  const store = createBookmarksStore().create('fixture')
  // Observable fetch counter — tests assert the drain stops after close.
  const calls = { count: 0 }

  function Live() {
    const [snap, setSnap] = useState(() => buildSnapshot({ users, hasMore: olderPages.length > 0 }))
    const remainingRef = useRef(olderPages.length)
    // The loaded window accumulates: each page PREPENDS to the already
    // loaded users (a real loadOlder keeps older history in the snapshot).
    const loadedRef = useRef({ users })
    const loadOlder = useMemo(
      () => async () => {
        const remaining = remainingRef.current
        if (remaining <= 0) return
        calls.count += 1
        remainingRef.current = remaining - 1
        const page = olderPages[olderPages.length - remaining]
        loadedRef.current = { users: [...page, ...loadedRef.current.users] }
        setSnap(buildSnapshot({ users: loadedRef.current.users, hasMore: remaining - 1 > 0 }))
      },
      [users, olderPages],
    )
    const useSession: (selector: (s: ConversationSnapshotFixture) => unknown) => unknown = (selector) =>
      selector(snap)
    const props = {
      useSession,
      sessionId: 'fixture',
      useProjection: () => undefined,
      loadOlder,
      useStore: (selector: (snap: { keys: string[] }) => unknown) => selector(store.getSnapshot()),
      actions: store.actions,
      t: makeT(zh as Record<string, string>),
      forkAt: vi.fn(async () => 'child-id'),
      searchSessions: vi.fn(async () => ({ items: [], hasMore: false })),
      openSession: vi.fn(),
    } as unknown as MilestoneRailProps
    return (
      <div data-conversation-scroll>
        <div style={{ height: 400 }}>
          {olderAll.concat(users).map((user) => (
            <div key={user.key} data-chat-anchor-key={user.key} style={{ height: 48 }}>
              {user.text}
            </div>
          ))}
        </div>
        <MilestoneRail {...props} />
      </div>
    )
  }

  return { ...renderUi(<Live />), calls }
}

/** One older page: 2 marks that predate the initially loaded window. */
function olderPage(prefix: string, base: number): RailUser[] {
  return [
    { key: `13:user<${prefix}-1>`, seq: base, time: 1_700_000_000_000 + base, text: `${prefix}第一个问题` },
    { key: `13:user<${prefix}-2>`, seq: base + 1, time: 1_700_000_060_000 + base, text: `${prefix}第二个问题` },
  ]
}

describe('MilestoneRail milestone list panel (P3)', () => {
  it('renders a list toggle armed off with the open-list label', () => {
    render()
    expandToolbar()

    const btn = toggle()
    expect(btn).toHaveAttribute('data-list-toggle')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveAttribute('aria-label', '打开列表')
    // The panel is closed initially.
    expect(panel()).toBeNull()
  })

  it('clicking the toggle opens the panel listing one entry per mark with its preview', () => {
    render()
    expandToolbar()

    fireEvent.click(toggle())

    expect(panel()).not.toBeNull()
    // One entry per user-prompt mark — all marks, unfiltered.
    expect(items()).toHaveLength(USERS.length)
    items().forEach((item, i) => {
      expect(item).toHaveAttribute('data-list-item')
      expect(item.textContent).toContain(USERS[i].text)
    })
  })

  it('clicking an entry jumps to that message — same scrollIntoView path as the dots', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')

    render()
    expandToolbar()
    fireEvent.click(toggle())

    // The second entry carries its mark key and jumps to the anchor row.
    const target = items()[1]
    expect(target).toHaveAttribute('data-jump-key', USERS[1].key)

    fireEvent.click(target)

    expect(spy).toHaveBeenCalled()
    const jumpedRow = spy.mock.instances.at(-1) as HTMLElement | undefined
    expect(jumpedRow?.dataset.chatAnchorKey).toBe(USERS[1].key)
  })

  it('Escape or re-clicking the toggle closes the panel', () => {
    render()
    expandToolbar()

    fireEvent.click(toggle())
    expect(panel()).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(panel()).toBeNull()

    // Re-opening arms the toggle (its label flips to the close action);
    // re-clicking the armed toggle closes the panel again.
    fireEvent.click(toggle())
    expect(panel()).not.toBeNull()
    const armed = screen.getByRole('button', { name: '收起列表' })
    expect(armed).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(armed)
    expect(panel()).toBeNull()
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
    expect(toggle()).toHaveAttribute('aria-label', '打开列表')
  })

  it('the bookmarks / focus / search toggles remain intact and functional', () => {
    render()
    expandToolbar()

    const bookmarks = screen.getByRole('button', { name: '只看收藏' })
    const focus = screen.getByRole('button', { name: '聚焦模式' })
    const search = screen.getByRole('button', { name: '搜索消息' })

    // Bookmarks filter toggles on/off.
    fireEvent.click(bookmarks)
    expect(bookmarks).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(bookmarks)
    expect(bookmarks).toHaveAttribute('aria-pressed', 'false')

    // Focus mode arms/disarms and swaps its label.
    fireEvent.click(focus)
    expect(focus).toHaveAttribute('aria-pressed', 'true')
    expect(focus).toHaveAttribute('aria-label', '退出聚焦')
    fireEvent.click(focus)
    expect(focus).toHaveAttribute('aria-pressed', 'false')

    // Search panel still opens.
    fireEvent.click(search)
    expect(document.querySelector('[data-rail-search]')).not.toBeNull()
  })

  it('a pointerdown outside the panel calls onClose (outside dismissal contract)', () => {
    const onClose = vi.fn()
    renderPanel(onClose)

    fireEvent.pointerDown(document.body)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a pointerdown inside the panel does not dismiss it', () => {
    const onClose = vi.fn()
    renderPanel(onClose)

    fireEvent.pointerDown(items()[0])

    expect(onClose).not.toHaveBeenCalled()
    expect(panel()).not.toBeNull()
  })

  it('a pointerdown OUTSIDE the open panel closes it through the rail-wired onClose', () => {
    render()
    expandToolbar()
    fireEvent.click(toggle())
    expect(panel()).not.toBeNull()

    fireEvent.pointerDown(document.body)

    expect(panel()).toBeNull()
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
  })

  it('opening the list drains every older page so the panel covers the whole session', async () => {
    // 2 current marks + 2 older pages (2 marks each) = 6 rows once drained.
    const current = [
      { key: '13:user<cur-1>', seq: 5, time: 1_700_000_000_000 + 5, text: '当前第一个问题' },
      { key: '13:user<cur-2>', seq: 6, time: 1_700_000_060_000 + 6, text: '当前第二个问题' },
    ]
    const older = [olderPage('老一页', 3), olderPage('老二页', 1)]
    const { calls } = renderLiveRail(current, older)
    expandToolbar()

    // Before opening, the list is closed — no drain has run.
    expect(calls.count).toBe(0)
    fireEvent.click(toggle())
    expect(panel()).not.toBeNull()
    // The panel starts from the loaded window (≥ the 2 current marks); the
    // first page may already land in the same act batch, so only the drain's
    // END state is pinned exactly.

    // The drain fetches one page per commit until hasMore is false: the panel
    // grows to all 6 marks, oldest first, and the loading hint disappears.
    await waitFor(() => expect(items()).toHaveLength(6))
    expect(calls.count).toBe(2)
    expect(items().at(0)?.textContent).toContain('老二页第一个问题')
    expect(items().at(4)?.textContent).toContain('当前第一个问题')
    await waitFor(() => expect(document.querySelector('[data-list-loading]')).toBeNull())
  })

  it('closing the panel mid-drain stops further page fetches', async () => {
    const current = [
      { key: '13:user<cur-1>', seq: 5, time: 1_700_000_000_000 + 5, text: '当前第一个问题' },
      { key: '13:user<cur-2>', seq: 6, time: 1_700_000_060_000 + 6, text: '当前第二个问题' },
    ]
    const older = [olderPage('老一页', 3), olderPage('老二页', 1), olderPage('老三页', 0)]
    const { calls } = renderLiveRail(current, older)
    expandToolbar()
    fireEvent.click(toggle())

    // The first page lands; close the panel before the rest arrive.
    await waitFor(() => expect(calls.count).toBeGreaterThanOrEqual(1))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(panel()).toBeNull()

    // Any page already in flight when the panel closed may still land; after
    // it does, NO further fetches may start (the drain is dead).
    await new Promise((resolve) => setTimeout(resolve, 20))
    const settled = calls.count
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls.count).toBe(settled)
  })
})
