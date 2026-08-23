/**
 * RED component tests for the milestone rail's focus mode (P3): a rail-top
 * toggle that dims the harness's AI thinking/scratchpad blocks
 * (`[data-variant="think"]`) so the conversation reads cleaner.
 *
 * Contract asserted:
 *   - a rail-top toggle button `[data-focus-toggle]` renders with
 *     `aria-pressed="false"` and the `focus.on` label initially
 *   - clicking it flips `data-focus-active` on the RAIL ROOT (the flex
 *     column with `aria-label` = rail.label) from undefined → 'true' → back,
 *     and the button's aria-pressed follows
 *   - while focus is active the component emits an inline <style> whose text
 *     contains the `[data-variant="think"]` dim rule; when inactive no such
 *     style exists
 *   - focus toggling never disturbs the existing search/bookmark toggles
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent } from '@testing-library/react'
import { renderRail } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'

const USERS: RailUser[] = [
  { key: '13:user<focus-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<focus-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** B1: the toolbar defaults COLLAPSED — expand it to reveal the focus toggle. */
function expandToolbar() {
  const btn = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (btn === null) throw new Error('data-toolbar-expand not found')
  fireEvent.click(btn)
}

/** The rail-top focus-mode toggle button. */
function focusToggle(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-focus-toggle]')
  if (el === null) throw new Error('data-focus-toggle not found')
  return el
}

/** The rail root: the outer flex column (identified by rail.label's zh copy). */
function railRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>('div[aria-label="会话里程碑"]')
  if (el === null) throw new Error('rail root not found')
  return el
}

/** Text of any <style> whose content contains `fragment`, or null. */
function styleContaining(fragment: string): string | null {
  for (const style of document.querySelectorAll('style')) {
    if (style.textContent?.includes(fragment)) return style.textContent
  }
  return null
}

describe('MilestoneRail focus mode (P3)', () => {
  it('renders a focus toggle button with aria-pressed false and the focus.on label', () => {
    renderRail(USERS)
    expandToolbar()

    const toggle = focusToggle()
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('aria-label', '聚焦模式')
  })

  it('clicking the toggle flips data-focus-active on the rail root and aria-pressed', () => {
    renderRail(USERS)
    expandToolbar()
    const toggle = focusToggle()
    const root = railRoot()

    expect(root).not.toHaveAttribute('data-focus-active')

    fireEvent.click(toggle)
    expect(root).toHaveAttribute('data-focus-active', 'true')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute('aria-label', '退出聚焦')

    fireEvent.click(toggle)
    expect(root).not.toHaveAttribute('data-focus-active')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('aria-label', '聚焦模式')
  })

  it('emits the think-block dim style only while focus is active', () => {
    renderRail(USERS)
    expandToolbar()

    expect(styleContaining('[data-variant="think"]')).toBeNull()

    fireEvent.click(focusToggle())
    const css = styleContaining('[data-variant="think"]')
    expect(css).not.toBeNull()
    expect(css).toContain('opacity: 0.4')

    fireEvent.click(focusToggle())
    expect(styleContaining('[data-variant="think"]')).toBeNull()
  })

  it('focus toggling leaves the search and bookmark toggles intact', () => {
    renderRail(USERS)
    expandToolbar()

    fireEvent.click(focusToggle())

    const searchToggle = document.querySelector('[data-search-toggle]')
    expect(searchToggle).not.toBeNull()
    expect(searchToggle).toHaveAttribute('aria-pressed', 'false')

    const bookmarkToggle = document.querySelector('[data-bookmarks-toggle]')
    expect(bookmarkToggle).not.toBeNull()
    expect(bookmarkToggle).toHaveAttribute('aria-pressed', 'false')
  })
})
