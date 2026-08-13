/**
 * useCurrentAnchor: tracks which user-message row sits at/just above the
 * conversation scrollport's top, so the rail can light the corresponding dot
 * (F2 current-position highlight).
 *
 * Resolves the harness DOM shape (`[data-conversation-scroll]` containing
 * `[data-chat-anchor-key]` rows), computes each row's offset top within the
 * scrollport, and feeds them to `rail-logic.currentIndexOf(rows, 0)` — the
 * viewport top is 0 in scrollport-relative coordinates.
 *
 * Recomputes on scrollport `scroll` events; when `IntersectionObserver` exists
 * (real browsers) rows are also observed (root = scrollport, threshold 0) so
 * layout changes that move a row across the top without a scroll event still
 * refresh. In jsdom tests the observer stub is a no-op, so the scroll listener
 * is the path component tests drive.
 *
 * Pure observation: no timers, no polling; geometry is read only on events.
 */
import { useEffect, useState } from 'react'
import { currentIndexOf } from './rail-logic.ts'

/**
 * @param order - the ordered chat node keys; a change re-resolves the DOM
 *   rows (new messages appended, load-older prepends, ...).
 * @returns the anchor key of the row at/just above the scrollport top, or
 *   undefined when the scrollport is missing or has no rows.
 */
export function useCurrentAnchor(order: readonly string[]): string | undefined {
  const [current, setCurrent] = useState<string | undefined>(undefined)

  useEffect(() => {
    const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null) {
      setCurrent(undefined)
      return
    }
    const rows = [...scrollport.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')]

    const compute = (): void => {
      const viewportTop = scrollport.getBoundingClientRect().top
      const positioned = rows.map((row) => ({
        key: row.dataset.chatAnchorKey ?? '',
        top: row.getBoundingClientRect().top - viewportTop,
      }))
      setCurrent(currentIndexOf(positioned, 0))
    }

    compute()
    scrollport.addEventListener('scroll', compute, { passive: true })
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(compute, { root: scrollport, threshold: [0] })
      for (const row of rows) observer.observe(row)
      return () => {
        observer.disconnect()
        scrollport.removeEventListener('scroll', compute)
      }
    }
    return () => {
      scrollport.removeEventListener('scroll', compute)
    }
  }, [order])

  return current
}
