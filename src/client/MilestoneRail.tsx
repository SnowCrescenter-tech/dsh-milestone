/**
 * MilestoneRail: the milestone.rail entry (session scope). It reads the
 * conversation snapshot through `useSession`, finds every user-message row in
 * the chat flow, and renders a fixed right-side vertical scrubber: one tick
 * per user message positioned by real rendered offset, a hover preview of the
 * message text, and click-to-jump via the row's `data-chat-anchor-key` DOM
 * anchor.
 *
 * Scroll positioning mirrors the harness chat view's own flowTop math: a row's
 * content position is its scrollport-relative top plus the current scrollTop,
 * normalized against scrollHeight. Ticks recompute on scroll and on any
 * scrollport/row resize, throttled through requestAnimationFrame. Row elements
 * are cached once per message-list revision (O(n) per recompute, not O(n^2)).
 */
import { useLayoutEffect, useMemo, useState } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export type MilestoneRailProps = PropsRuntime<'milestone.rail'>

/** One tick: the user-message node key plus its normalized content position. */
interface Tick {
  readonly key: string
  readonly top: number
}

/** Fixed placement of the rail, aligned to the conversation scrollport. */
interface RailBox {
  readonly top: number
  readonly height: number
  readonly right: number
}

interface HoverPreview {
  readonly key: string
  readonly preview: string
  readonly top: number
}

const PREVIEW_LENGTH = 80

/** Minimum ticks before the rail adds value. */
const MIN_TICKS = 2

/**
 * Find a chat row by its node key, avoiding CSS.escape pitfalls on keys that
 * contain `<`/`>`/`:` (the node key is `12:input-message<messageId>`).
 * Mirrors the harness ChatView's `anchorElement` scan.
 */
function findRow(key: string): HTMLElement | null {
  for (const row of document.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/**
 * @param props - session standard kit (useSession, sessionId, useProjection).
 */
export function MilestoneRail({ useSession }: MilestoneRailProps) {
  const order = useSession(s => s.chat.order)
  const nodes = useSession(s => s.chat.nodes)

  // Ordered user-message node keys; node kind 'user' is the append-origin
  // human prompt (steering/context/assistant/tool kinds are skipped).
  const userKeys = useMemo(
    () => order.filter(key => nodes.get(key)?.kind === 'user'),
    [order, nodes],
  )

  const [ticks, setTicks] = useState<Tick[]>([])
  const [railBox, setRailBox] = useState<RailBox | null>(null)
  const [hover, setHover] = useState<HoverPreview | null>(null)

  useLayoutEffect(() => {
    if (userKeys.length < MIN_TICKS) {
      setTicks([])
      setRailBox(null)
      return
    }
    const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null) return

    // Cache row elements once per message-list revision; recompute stays O(n).
    const rowCache = new Map<string, HTMLElement>()
    for (const key of userKeys) {
      const row = findRow(key)
      if (row !== null) rowCache.set(key, row)
    }

    const compute = (): void => {
      const sp = scrollport.getBoundingClientRect()
      const total = scrollport.scrollHeight
      const next: Tick[] = []
      for (const key of userKeys) {
        let row = rowCache.get(key)
        if (row === undefined || !row.isConnected) {
          const fresh = findRow(key)
          if (fresh === null) continue
          row = fresh
          rowCache.set(key, fresh)
        }
        const contentTop = row.getBoundingClientRect().top - sp.top + scrollport.scrollTop
        const top = total > 0 ? (contentTop / total) * 100 : 0
        next.push({ key, top: Math.min(99, Math.max(0, top)) })
      }
      setTicks(next)
      setRailBox({
        top: sp.top,
        height: sp.height,
        right: Math.max(4, window.innerWidth - sp.right),
      })
    }

    compute()

    // Throttle recompute through rAF; scroll and resize both feed it.
    let raf = 0
    const schedule = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(compute)
    }
    scrollport.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(scrollport)
    for (const row of rowCache.values()) observer.observe(row)
    return () => {
      cancelAnimationFrame(raf)
      scrollport.removeEventListener('scroll', schedule)
      observer.disconnect()
    }
  }, [userKeys])

  if (railBox === null || ticks.length < MIN_TICKS) return null

  const jump = (key: string): void => {
    findRow(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const onEnter = (tick: Tick): void => {
    const preview = findRow(tick.key)?.textContent?.trim().slice(0, PREVIEW_LENGTH) ?? ''
    setHover({ key: tick.key, preview, top: tick.top })
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: railBox.top,
        right: railBox.right,
        height: railBox.height,
        width: 20,
        pointerEvents: 'auto',
        zIndex: 100,
      }}
      aria-label="Conversation milestones"
    >
      {ticks.map(tick => (
        <button
          key={tick.key}
          type="button"
          style={{
            position: 'absolute',
            top: `${tick.top}%`,
            right: 6,
            width: 8,
            height: 3,
            borderRadius: 2,
            border: 'none',
            padding: 0,
            background: hover?.key === tick.key ? '#4d7cfe' : 'rgba(120, 130, 150, 0.5)',
            cursor: 'pointer',
          }}
          onMouseEnter={() => onEnter(tick)}
          onMouseLeave={() => setHover(null)}
          onClick={() => jump(tick.key)}
          aria-label="Jump to user message"
        />
      ))}
      {hover !== null && (
        <div
          style={{
            position: 'fixed',
            right: railBox.right + 22,
            top: railBox.top + (railBox.height * hover.top) / 100,
            transform: 'translateY(-50%)',
            maxWidth: 280,
            padding: '8px 10px',
            background: 'rgba(20, 24, 32, 0.95)',
            color: '#e6e8ee',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            zIndex: 101,
          }}
        >
          {hover.preview}
        </div>
      )}
    </div>
  )
}
