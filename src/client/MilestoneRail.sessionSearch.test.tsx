/**
 * Component tests for the milestone rail's cross-session search (P3): the
 * rail-top toggle opens a fixed panel whose debounced input searches EVERY
 * session through the injected `searchSessions` action; result rows show
 * title + snippet, clicking one opens that session (`openSession`) and closes
 * the panel; failures surface the `search.error` locale text. Outside-pointer
 * dismissal is pinned too: a pointerdown outside the open panel closes it,
 * one inside keeps it open.
 *
 * DOM contract pinned here:
 *   - `[data-session-search-toggle]`   the toggle button (aria-pressed).
 *   - `[data-session-search]`          the panel root.
 *   - `[data-session-search-input]`    the debounced query input.
 *   - `[data-session-search-result]`   one row per hit (title + snippet).
 *   - `[data-session-search-error]`    the failure notice.
 *   - `[data-session-search-more]`     the truncated-results footer hint.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { renderRail as renderRailImpl } from '../test/renderRail.tsx'
import type { RailUser, SessionSearchHit } from '../test/renderRail.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** 2 users -> 2 marks -> the rail renders. */
const USERS: RailUser[] = [
  { key: '13:user<cross-1>', seq: 1, time: 1_700_000_000_000, text: '第一个问题：如何优化构建速度' },
  { key: '13:user<cross-2>', seq: 2, time: 1_700_000_060_000, text: '第二个问题：如何减少内存占用' },
]

type SearchOverride = (query: string, signal: AbortSignal) => Promise<{ items: SessionSearchHit[]; hasMore: boolean }>

function render(opts?: { searchSessions?: SearchOverride; openSession?: (id: string) => void }) {
  return renderRailImpl(USERS, {
    searchSessions: opts?.searchSessions ?? vi.fn(async () => ({ items: [], hasMore: false })),
    openSession: opts?.openSession ?? vi.fn(),
  })
}

/** B1: the toolbar defaults COLLAPSED — expand it to reveal the search toggle. */
function expandToolbar() {
  const btn = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (btn === null) throw new Error('data-toolbar-expand not found')
  fireEvent.click(btn)
}

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: '打开跨会话搜索' })
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-session-search]')
}

function input(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('[data-session-search-input]')!
}

function results(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-session-search-result]')]
}

describe('MilestoneRail cross-session search (P3)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('renders the cross-session toggle armed off with the open label', () => {
    render()
    expandToolbar()

    const btn = toggle()
    expect(btn).toHaveAttribute('data-session-search-toggle')
    expect(btn).toHaveAttribute('aria-pressed', 'false')
    expect(btn).toHaveAttribute('aria-label', '打开跨会话搜索')
    // The panel is closed initially.
    expect(panel()).toBeNull()
  })

  it('clicking the toggle opens the panel with a focused input', () => {
    render()
    expandToolbar()

    fireEvent.click(toggle())

    expect(panel()).not.toBeNull()
    expect(input()).not.toBeNull()
    expect(input()).toHaveAttribute('placeholder', '跨会话搜索')
    // The armed toggle flips to the close label.
    const armed = screen.getByRole('button', { name: '收起跨会话搜索' })
    expect(armed).toHaveAttribute('data-session-search-toggle')
    expect(armed).toHaveAttribute('aria-pressed', 'true')
  })

  it('typing debounces the search and calls searchSessions with the trimmed query and an AbortSignal', async () => {
    const searchSessions = vi.fn(async () => ({ items: [], hasMore: false }))
    render({ searchSessions })
    expandToolbar()

    fireEvent.click(toggle())
    fireEvent.change(input(), { target: { value: '  rust  ' } })

    // Before the debounce elapses no search fires.
    expect(searchSessions).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(searchSessions).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150)
    })
    expect(searchSessions).toHaveBeenCalledTimes(1)
    expect(searchSessions).toHaveBeenCalledWith('rust', expect.any(AbortSignal))
    // An empty result set renders no rows and no footer hint.
    expect(results()).toHaveLength(0)
    expect(document.querySelector('[data-session-search-more]')).toBeNull()
  })

  it('aborts an in-flight search when the query is superseded before it settles', async () => {
    const signals: AbortSignal[] = []
    const searchSessions = vi.fn(async (_query: string, signal: AbortSignal) => {
      signals.push(signal)
      return { items: [], hasMore: false }
    })
    render({ searchSessions })
    expandToolbar()

    fireEvent.click(toggle())
    fireEvent.change(input(), { target: { value: 'ru' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(searchSessions).toHaveBeenCalledTimes(1)

    // Superseding the query aborts the in-flight request before it settles.
    fireEvent.change(input(), { target: { value: 'rust' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(searchSessions).toHaveBeenCalledTimes(2)
    expect(searchSessions).toHaveBeenLastCalledWith('rust', expect.any(AbortSignal))
    expect(signals[0].aborted).toBe(true)
    expect(signals[1].aborted).toBe(false)
  })

  it('renders one row per hit with its title and snippet; clicking opens the session and closes the panel', async () => {
    const openSession = vi.fn()
    const searchSessions = vi.fn(async () => ({
      items: [
        { sessionId: 's1', snippet: '…Rust 所有权规则详解…', title: 'Rust 学习笔记' },
        // No list title — falls back to the untitled locale text.
        { sessionId: 's2', snippet: '…如何避免死锁…' },
      ],
      hasMore: true,
    }))
    render({ searchSessions, openSession })
    expandToolbar()

    fireEvent.click(toggle())
    fireEvent.change(input(), { target: { value: 'rust' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    const rows = results()
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveAttribute('data-session-search-result')
    expect(rows[0].textContent).toContain('Rust 学习笔记')
    expect(rows[0].textContent).toContain('…Rust 所有权规则详解…')
    expect(rows[1].textContent).toContain('（无标题）')
    expect(rows[1].textContent).toContain('…如何避免死锁…')
    // Capped results surface the refine-your-query footer hint.
    expect(document.querySelector('[data-session-search-more]')).not.toBeNull()
    expect(screen.getByText('结果已截断，请细化关键词')).not.toBeNull()

    fireEvent.click(rows[0])
    expect(openSession).toHaveBeenCalledTimes(1)
    expect(openSession).toHaveBeenCalledWith('s1')
    // Opening a session closes the panel.
    expect(panel()).toBeNull()
  })

  it('shows the error locale text when searchSessions rejects', async () => {
    const searchSessions = vi.fn(async () => {
      throw new Error('boom')
    })
    render({ searchSessions })
    expandToolbar()

    fireEvent.click(toggle())
    fireEvent.change(input(), { target: { value: 'rust' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })

    expect(document.querySelector('[data-session-search-error]')).not.toBeNull()
    expect(screen.getByText('搜索失败，请重试')).not.toBeNull()
  })

  it('Escape closes the panel', () => {
    render()
    expandToolbar()

    fireEvent.click(toggle())
    expect(panel()).not.toBeNull()

    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(panel()).toBeNull()
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
  })

  it('a pointerdown outside the panel closes it', () => {
    render()
    expandToolbar()

    fireEvent.click(toggle())
    expect(panel()).not.toBeNull()

    fireEvent.pointerDown(document.body)

    expect(panel()).toBeNull()
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')
  })

  it('a pointerdown inside the panel keeps it open', () => {
    render()
    expandToolbar()

    fireEvent.click(toggle())
    fireEvent.pointerDown(input())

    expect(panel()).not.toBeNull()
  })

  it('the bookmarks / focus / list toggles remain intact alongside the search toggle', () => {
    render()
    expandToolbar()

    const bookmarks = screen.getByRole('button', { name: '只看收藏' })
    const focus = screen.getByRole('button', { name: '聚焦模式' })
    const list = screen.getByRole('button', { name: '打开列表' })

    fireEvent.click(bookmarks)
    expect(bookmarks).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(focus)
    expect(focus).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(list)
    expect(document.querySelector('[data-milestone-list]')).not.toBeNull()
    // The cross-session panel stays independent of the sibling panels.
    expect(panel()).toBeNull()
  })
})
