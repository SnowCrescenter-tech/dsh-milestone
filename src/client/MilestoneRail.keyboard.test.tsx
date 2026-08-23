/**
 * RED component tests for keyboard navigation of the milestone rail
 * (roving tabindex over the dot list, per the WAI-ARIA arrow-key pattern).
 *
 * The feature is NOT implemented yet — the dots scroll container currently
 * has no `data-rail-list`, no `tabIndex`, and no arrow-key handling. These
 * tests pin the data contract the component WILL implement, so they fail
 * now for the right reason (missing `data-rail-list` / `data-rail-dot`)
 * and turn green once the widget wiring lands:
 *
 *   - `[data-rail-list]` = the ONE focusable dots container (tabIndex 0,
 *     aria-label "会话里程碑列表").
 *   - `[data-rail-dot]` = each dot button; roving tabindex (0 on the
 *     focused dot, -1 on every other).
 *   - ArrowDown/ArrowUp move focus (wrapping); Home/End jump to first/last.
 *   - Enter on a focused dot jumps to that dot's anchor row.
 *   - ArrowDown inside the search input must NOT steal dot focus.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderRail as renderRailImpl } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** 3 users -> 3 dots; each user message gets one `data-chat-anchor-key` row. */
const USERS: RailUser[] = [
  { key: '13:user<kbd-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息：如何优化构建' },
  { key: '13:user<kbd-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息：如何减少内存' },
  { key: '13:user<kbd-3>', seq: 3, time: 1_700_000_120_000, text: '第三条消息：如何加速启动' },
]

function render(users: RailUser[] = USERS) {
  return renderRailImpl(users)
}

/** The dots scroll container the widget contract requires. Throws while the
 * feature is unimplemented, so every keyboard test fails on the missing
 * `data-rail-list` rather than on a misleading downstream assertion. */
function railList(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-rail-list]')
  if (el === null) throw new Error('[data-rail-list] not found (keyboard widget not implemented)')
  return el
}

/** The nth dot, by its accessible name (already a button today). */
function dot(n: number): HTMLElement {
  return screen.getByRole('button', { name: `跳转到第 ${n} 条消息` })
}

/** Every dot button, in DOM (render) order. */
function dots(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-rail-dot]')]
}

/** Dispatch a keydown on whatever currently owns focus (the list or a dot). */
function pressKey(key: string): void {
  const target = document.activeElement
  if (target === null) throw new Error('document.activeElement is null')
  fireEvent.keyDown(target, { key })
}

/** B1: the toolbar defaults COLLAPSED — expand it to reveal the search toggle. */
function expandToolbar() {
  const btn = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (btn === null) throw new Error('data-toolbar-expand not found')
  fireEvent.click(btn)
}

function searchToggle(): HTMLElement {
  return screen.getByRole('button', { name: '搜索消息' })
}

function searchInput(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('[data-rail-search]')
  if (el === null) throw new Error('data-rail-search not found')
  return el
}

describe('MilestoneRail keyboard navigation (RED — feature not implemented)', () => {
  it('renders the dots scroll container as one focusable widget: data-rail-list, tabIndex 0, aria-label', () => {
    render()

    const list = railList()

    expect(list).toHaveAttribute('data-rail-list')
    expect(list).toHaveAttribute('aria-label', '会话里程碑列表')
    expect(list.tabIndex).toBe(0)
  })

  it('uses a roving tabindex: after focusing the list exactly one dot has tabIndex 0, the rest -1', () => {
    render()
    const list = railList()
    list.focus()

    const dotEls = dots()
    expect(dotEls).toHaveLength(3)
    for (const el of dotEls) {
      expect(el).toHaveAttribute('data-rail-dot')
    }
    // The initial tab stop is the first dot; every other dot is skipped by Tab.
    expect(dotEls.filter((el) => el.tabIndex === 0)).toHaveLength(1)
    expect(dotEls[0].tabIndex).toBe(0)
    expect(dotEls[1].tabIndex).toBe(-1)
    expect(dotEls[2].tabIndex).toBe(-1)

    // The tab stop follows focus: ArrowDown roves the 0 onto the second dot.
    pressKey('ArrowDown')
    expect(dotEls[0].tabIndex).toBe(-1)
    expect(dotEls[1].tabIndex).toBe(0)
  })

  it('ArrowDown/ArrowUp move focus to the next/previous dot, wrapping around; Home/End jump to first/last', () => {
    render()
    const list = railList()
    list.focus()

    pressKey('ArrowDown')
    expect(document.activeElement).toBe(dot(2))

    pressKey('ArrowUp')
    expect(document.activeElement).toBe(dot(1))

    // Wrap backward from the first dot to the last.
    pressKey('ArrowUp')
    expect(document.activeElement).toBe(dot(3))

    // Wrap forward from the last dot back to the first.
    pressKey('ArrowDown')
    expect(document.activeElement).toBe(dot(1))

    pressKey('End')
    expect(document.activeElement).toBe(dot(3))

    pressKey('Home')
    expect(document.activeElement).toBe(dot(1))
  })

  it('Enter on a focused dot jumps to that dot\'s anchor row', async () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    const user = userEvent.setup()

    render()
    const list = railList()
    list.focus()

    pressKey('Home') // first dot
    pressKey('ArrowDown') // second dot
    await user.keyboard('{Enter}')

    expect(spy).toHaveBeenCalled()
    const jumpedRow = spy.mock.instances.at(-1) as HTMLElement | undefined
    expect(jumpedRow?.dataset.chatAnchorKey).toBe(USERS[1].key)
  })

  it('ArrowDown inside the search input does not move dot focus', async () => {
    const user = userEvent.setup()

    render()
    expandToolbar()
    const list = railList()
    list.focus()
    pressKey('Home') // first dot owns focus

    fireEvent.click(searchToggle())
    const input = searchInput()
    input.focus()
    expect(document.activeElement).toBe(input)

    pressKey('ArrowDown')

    // The keystroke stays in the search field — dot focus and the roving tab
    // stop are untouched while the panel is open.
    expect(document.activeElement).toBe(input)
    expect(dot(1).tabIndex).toBe(0)
    expect(dot(2).tabIndex).toBe(-1)
  })
})
