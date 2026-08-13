/**
 * Component tests for the milestone rail's current-position highlight (F2):
 * the dot whose chat row sits at/just above the conversation viewport top
 * carries `data-current`, and the highlight moves when the viewport scrolls.
 *
 * jsdom measures nothing, so the scroll geometry is fully mocked: the
 * scrollport keeps a fixed rect (top 0) and each anchor row gets a known
 * offset top. The hook's scroll listener recomputes on every dispatched
 * `scroll` event; IntersectionObserver is a no-op stub in test setup, so the
 * scroll-listener path is exactly what runs here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderRail } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'

const USERS: RailUser[] = [
  { key: '13:user<cur-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<cur-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
  { key: '13:user<cur-3>', seq: 3, time: 1_700_000_120_000, text: '第三条消息' },
]

/** Mocked scrollport height (px); its top stays 0 (viewport-relative origin). */
const SCROLLPORT_HEIGHT = 400

/** jsdom's real implementation, kept for elements this test does not mock. */
const realGetBoundingClientRect = Element.prototype.getBoundingClientRect

/** Per-row offset tops (scrollport-relative), mutated between scroll events. */
const rowTops = new Map<string, number>()

/**
 * Replace element geometry with the mock table: the scrollport reports
 * `top: 0, height: 400`; each anchor row reports its `rowTops` entry (falling
 * back to jsdom's all-zero rect for rows without an entry and for every other
 * element — the rail's own layout reads never see fake geometry).
 */
function mockScrollGeometry(): void {
  rowTops.clear()
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (this.hasAttribute('data-conversation-scroll')) {
      return new DOMRect(0, 0, 0, SCROLLPORT_HEIGHT)
    }
    const key = this.getAttribute('data-chat-anchor-key')
    if (key !== null) {
      const top = rowTops.get(key)
      if (top !== undefined) return new DOMRect(0, top, 0, 48)
    }
    return realGetBoundingClientRect.call(this)
  })
}

function dot(n: number) {
  return screen.getByRole('button', { name: `跳转到第 ${n} 条消息` })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MilestoneRail current-position highlight (F2)', () => {
  it('lights the row at/just above the viewport top and moves it on scroll', () => {
    mockScrollGeometry()
    // All rows below the viewport top (scrollport-relative 0): currentIndexOf
    // falls back to the FIRST row until scrolling pulls one to the top.
    rowTops.set('13:user<cur-1>', 100)
    rowTops.set('13:user<cur-2>', 300)
    rowTops.set('13:user<cur-3>', 500)
    renderRail(USERS)

    const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null) throw new Error('missing [data-conversation-scroll]')

    fireEvent.scroll(scrollport)
    expect(dot(1)).toHaveAttribute('data-current', 'true')
    expect(dot(2)).not.toHaveAttribute('data-current')
    expect(dot(3)).not.toHaveAttribute('data-current')

    // Scrolled down: rows 1-2 passed above the top, row 2 now sits at it.
    rowTops.set('13:user<cur-1>', -250)
    rowTops.set('13:user<cur-2>', -50)
    rowTops.set('13:user<cur-3>', 150)
    fireEvent.scroll(scrollport)

    expect(dot(2)).toHaveAttribute('data-current', 'true')
    expect(dot(1)).not.toHaveAttribute('data-current')
    expect(dot(3)).not.toHaveAttribute('data-current')

    // Scrolled further: row 3 is now the one at/just above the top.
    rowTops.set('13:user<cur-1>', -450)
    rowTops.set('13:user<cur-2>', -250)
    rowTops.set('13:user<cur-3>', -50)
    fireEvent.scroll(scrollport)

    expect(dot(3)).toHaveAttribute('data-current', 'true')
    expect(dot(1)).not.toHaveAttribute('data-current')
    expect(dot(2)).not.toHaveAttribute('data-current')
  })
})
