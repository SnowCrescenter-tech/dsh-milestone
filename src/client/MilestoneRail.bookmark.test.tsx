/**
 * RED component tests for the milestone rail's bookmark feature: the star
 * toggle in the hover tooltip, persisted bookmarks visible on the blue dot,
 * and the bookmarks-only rail-top filter.
 *
 * The feature is NOT implemented yet — the store in bookmarkStore.ts exists
 * (real engine, persisted to localStorage), but MilestoneRail never reads it.
 * These tests assert the data contract the implementation WILL ship and
 * therefore FAIL for the right reason: the `data-star` / `data-bookmarked` /
 * `data-bookmarks-toggle` attributes are missing from the rendered DOM.
 *
 * Contract asserted:
 *   - each dot's inner <span> (the blue dot) carries `data-bookmarked="true"`
 *     when its mark key is bookmarked, so bookmarks are visible without hover
 *   - the hover tooltip (currently `pointerEvents:'none'`) becomes hover-stable
 *     and contains a star toggle button `[data-star]` carrying `aria-pressed`
 *     and `data-starred` (true when bookmarked); clicking it toggles the
 *     bookmark, which the real store persists under
 *     `dsh-milestone.bookmarks.fixture`
 *   - a rail-top filter toggle `[data-bookmarks-toggle]` carries
 *     `data-active="true"` when the bookmarks-only filter is on; non-bookmarked
 *     dots are then NOT rendered, and the search N/M counter reflects the
 *     bookmarked total
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderRail } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'

const USERS: RailUser[] = [
  { key: '13:user<bm-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<bm-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
  { key: '13:user<bm-3>', seq: 3, time: 1_700_000_120_000, text: '第三条消息' },
]

/** Persist key the real store engine writes (prefix + `create('fixture')` scope). */
const PERSIST_KEY = 'dsh-milestone.bookmarks.fixture'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** B1: the toolbar defaults COLLAPSED — expand it to reveal the rail-top toggles. */
function expandToolbar() {
  const btn = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (btn === null) throw new Error('data-toolbar-expand not found')
  fireEvent.click(btn)
}

function dot(n: number) {
  return screen.getByRole('button', { name: `跳转到第 ${n} 条消息` })
}

/** The blue dot: the inner <span> of the nth dot button. */
function dotSpan(n: number): HTMLElement {
  const span = dot(n).querySelector<HTMLElement>('span')
  if (span === null) throw new Error(`dot ${n} has no inner span`)
  return span
}

/** The star toggle button inside the hover tooltip. */
function starToggle(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-star]')
  if (el === null) throw new Error('data-star not found')
  return el
}

/** The rail-top bookmarks-only filter toggle. */
function bookmarksToggle(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-bookmarks-toggle]')
  if (el === null) throw new Error('data-bookmarks-toggle not found')
  return el
}

/** The search panel's N/M counter. */
function matchCount(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-match-count]')
  if (el === null) throw new Error('data-match-count not found')
  return el
}

/** Every rendered dot button (dot buttons are the only `跳转到第 N 条消息` buttons). */
function dotButtons(): NodeListOf<HTMLButtonElement> {
  return document.querySelectorAll('button[aria-label^="跳转到第 "]')
}

describe('MilestoneRail bookmarks', () => {
  it('hovering a dot shows a star toggle; clicking it persists the bookmark to the store', () => {
    const { backing } = renderRail(USERS)

    fireEvent.mouseEnter(dot(1))

    const star = starToggle()
    // Not bookmarked yet: the star is unfilled and aria-pressed is false.
    expect(star).not.toHaveAttribute('data-starred')
    expect(star).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(star)

    // The real store engine persisted synchronously under the fixture scope key.
    expect(backing.get(PERSIST_KEY)).toBe(JSON.stringify({ keys: [USERS[0].key] }))
    expect(star).toHaveAttribute('data-starred', 'true')
    expect(star).toHaveAttribute('aria-pressed', 'true')
  })

  it('a seeded bookmark survives reload: the blue dot is marked without hovering', () => {
    const { backing } = renderRail(USERS, { bookmarks: [USERS[0].key] })

    expect(backing.get(PERSIST_KEY)).toBe(JSON.stringify({ keys: [USERS[0].key] }))

    expect(dotSpan(1)).toHaveAttribute('data-bookmarked', 'true')
    expect(dotSpan(2)).not.toHaveAttribute('data-bookmarked')
    expect(dotSpan(3)).not.toHaveAttribute('data-bookmarked')
  })

  it('the bookmarks-only filter hides non-bookmarked dots and stays active', () => {
    renderRail(USERS, { bookmarks: [USERS[0].key] })
    expandToolbar()

    const toggle = bookmarksToggle()
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('data-active', 'true')
    expect(dot(1)).toBeInTheDocument()
    expect(dotButtons()).toHaveLength(1)
    expect(document.querySelectorAll('button[aria-label="跳转到第 2 条消息"]')).toHaveLength(0)
    expect(document.querySelectorAll('button[aria-label="跳转到第 3 条消息"]')).toHaveLength(0)
  })

  it('with zero bookmarks the filter still renders its toggle but no dots', () => {
    renderRail(USERS)
    expandToolbar()

    const toggle = bookmarksToggle()
    fireEvent.click(toggle)

    expect(toggle).toHaveAttribute('data-active', 'true')
    expect(dotButtons()).toHaveLength(0)
  })

  it('the search N/M counter reflects the bookmarked total while filtering', () => {
    renderRail(USERS, { bookmarks: [USERS[0].key] })
    expandToolbar()

    fireEvent.click(bookmarksToggle())
    fireEvent.click(screen.getByRole('button', { name: '搜索消息' }))

    // One bookmarked mark and an empty query matches everything: 1/1.
    expect(matchCount().textContent).toBe('1/1')
  })
})
