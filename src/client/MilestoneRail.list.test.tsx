/**
 * Component tests for the milestone rail's expandable all-prompts list panel
 * (P3): the rail-top list toggle opens a fixed panel listing EVERY user-prompt
 * milestone (序号 + turn + preview), and clicking an entry jumps to that
 * message through the SAME `jump` path the rail dots use (scrollIntoView on
 * the `[data-chat-anchor-key]` row). Escape or re-clicking the toggle closes
 * the panel; the sibling toggles (bookmarks / focus / search) stay intact.
 *
 * Outside dismissal: pinned at the PANEL level (rendering MilestoneListPanel
 * directly with an onClose mock), because MilestoneRail.tsx does not pass
 * onClose to this panel yet — its owner is wiring that call site separately.
 * The hook contract (outside pointerdown → onClose; inside → no-op) is
 * exercised here; once the rail feeds a real onClose, the panel-level wiring
 * already in place activates end-to-end.
 *
 * DOM contract pinned here:
 *   - `[data-list-toggle]`            the toggle button (aria-pressed).
 *   - `[data-milestone-list]`         the panel root.
 *   - `[data-list-item]`              one row per mark (data-jump-key).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render as renderUi, screen } from '@testing-library/react'
import { MilestoneListPanel } from './MilestoneListPanel.tsx'
import { zh } from './locales.ts'
import { renderRail as renderRailImpl } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'

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
})
