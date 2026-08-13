/**
 * MilestoneRail: the milestone.rail entry (session scope). Renders a fixed
 * right-side vertical scrubber as a **fixed-pitch dot list** (like a git commit
 * graph), NOT a minimap: one dot per user message, equal spacing regardless of
 * conversation length. The list itself scrolls with the wheel when it outgrows
 * the viewport; hovering a dot shows rich metadata (time, turn, duration, end
 * reason, TTFT, tokens/sec) and clicking jumps the chat to that message.
 *
 * Data sources (all from the session-scoped `useSession` snapshot):
 *   - chat.order + chat.nodes.get(key)  -> user-message nodes (key/id/location)
 *   - chat.timeline.turns.get(turn)     -> turn start/end time, status, reason,
 *                                          and the ui-conversation 'turn-tail'
 *                                          location data (ttftMs/tokensPerSecond)
 *
 * Positioning: the rail hugs the conversation scrollport's right edge (offset a
 * little inward so it clears the native scrollbar and sits near the prose).
 *
 * In-rail search (F1): a magnifier toggle at the rail top opens a compact
 * panel to the rail's left with a message-text search input; matches light up
 * the dots (non-matches dim), Enter cycles the active match (wrapping) and
 * jumps to it, Escape clears and closes. Matching runs over the FULL message
 * text (`text` from rail-logic.extractText), not the truncated hover preview.
 *
 * Current-position highlight (F2): the dot for the user message at/just above
 * the conversation viewport top carries a white ring (`useCurrentAnchor`
 * observes the scrollport, no polling).
 *
 * Load-older + window coverage (F3): when the session still has earlier pages
 * (`hasMore`) a slim `···` button sits at the rail top and triggers the
 * injected `loadOlder` action (disabled + `data-loading-older` while
 * `loadingOlder`), and a compact hint to the rail's left states how many
 * messages the current window covers.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { InjectFace, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { createBookmarksStore } from './bookmarkStore.ts'
import { filterByBookmarks, isBookmarked } from './bookmark-logic'
import { clampIndex, nextFocusIndex } from './rail-keyboard'
import { dotColor, extractText, filterMarks, markState, nextMatchIndex } from './rail-logic'
import { RailSearchUi } from './MilestoneRailSearch.tsx'
import { MilestoneRailTooltip } from './MilestoneRailTooltip.tsx'
import { useCurrentAnchor } from './useCurrentAnchor.ts'

/**
 * F3 inject face: the rail entry registers an `inject` factory (index.ts)
 * binding the session-bound `loadOlder` action (see railInject.ts); the
 * framework spreads it onto the props at render time.
 *
 * T10 store seat: `index.ts` declares `store: createBookmarksStore`, so the
 * framework instantiates a per-session bookmarks store and injects the
 * `useStore` selector hook + baked `actions` onto the props via
 * `PropsStore<H>` (`H` = the store handle the factory returns).
 */
export type MilestoneRailProps = PropsRuntime<'milestone.rail'> &
  InjectFace<{ loadOlder: () => Promise<void> }> &
  PropsStore<ReturnType<typeof createBookmarksStore>>

/** Minimum user messages before the rail adds value. */
const MIN_MARKS = 2
const PREVIEW_LENGTH = 80
/** Stable no-bookmarks fallback for render paths without the store seat. */
const NO_BOOKMARKS: readonly string[] = []
/** Visual dot diameter (px). */
const DOT_SIZE = 12
/** Hit area per dot (px) — larger than the dot for comfortable clicking. */
const DOT_HIT = 22
/** Vertical gap between dot hit areas (px) — fixed pitch, never scaled. */
const DOT_GAP = 12
/** Inward offset from the scrollport right edge so the rail clears the scrollbar. */
const RAIL_INSET = 14

/** One user message: its node key (DOM anchor), turn, and payload bits. */
interface MilestoneMark {
  readonly key: string
  readonly turn: number | undefined
  readonly seq: number
  readonly time: number
  /** FULL plain text of the message — the search corpus (never truncated). */
  readonly text: string
  /** First 80 chars of the message — the hover tooltip preview. */
  readonly preview: string
}

/** In-rail search state (F1). */
interface SearchState {
  readonly query: string
  /** Position within the CURRENT match list (not a mark index). */
  readonly activePos: number
  readonly panelOpen: boolean
}

interface RailBox {
  readonly top: number
  readonly height: number
  readonly right: number
}

/** Hovered-dot metadata fed to the hover tooltip (MilestoneRailTooltip). */
export interface HoverInfo {
  readonly mark: MilestoneMark
  readonly index: number
  readonly total: number
  readonly turnLabel: string | null
  readonly durationLabel: string | null
  readonly reasonLabel: string | null
  readonly ttftLabel: string | null
  readonly tpsLabel: string | null
  /** Viewport-y center of the hovered dot, for tooltip placement. */
  readonly top: number
}

/**
 * Find a chat row by its node key, avoiding CSS.escape pitfalls on keys that
 * contain `<`/`>`/`:` (the node key is `13:input-message<messageId>`).
 */
function findRow(key: string): HTMLElement | null {
  for (const row of document.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/** Extract a plain-text hover preview (first 80 chars) from a ContentBlock[]. */
function extractPreview(content: unknown): string {
  return extractText(content).slice(0, PREVIEW_LENGTH)
}

/** Compact duration label (ms). */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m${s}s`
}

/** Human label for a TurnEndReason kind. */
function reasonLabelOf(kind: string): string {
  switch (kind) {
    case 'completed': return '已完成'
    case 'aborted': return '已中止'
    case 'error': return '出错'
    case 'max-tokens': return '达到上限'
    case 'interrupted': return '已中断'
    case 'blocked': return '已阻塞'
    default: return kind
  }
}

/** Read the ui-conversation 'turn-tail' location data (ttftMs/tokensPerSecond). */
function turnTailOf(turn: unknown): { ttftMs?: number; tokensPerSecond?: number } | undefined {
  const data = (turn as { data?: { get?: (key: string) => unknown } }).data
  if (data?.get === undefined) return undefined
  return data.get('turn-tail') as { ttftMs?: number; tokensPerSecond?: number } | undefined
}

/**
 * @param props - session standard kit (useSession, sessionId, useProjection),
 * the injected loadOlder action, and the bookmarks store pair (useStore +
 * actions, injected by the framework from the declared store seat).
 */
export function MilestoneRail({ useSession, loadOlder, useStore, actions }: MilestoneRailProps) {
  const order = useSession(s => s.chat.order)
  const nodes = useSession(s => s.chat.nodes)
  const timeline = useSession(s => s.chat.timeline)
  // F3: the conversation paging window. `hasMore` is boolean (no absolute
  // count available), `loadingOlder` gates the button while a page loads.
  const hasMore = useSession(s => s.hasMore)
  const loadingOlder = useSession(s => s.loadingOlder)
  // T10: the persisted bookmark key list (toggle order). The framework's
  // useStore is a uSES-bound selector hook, so this re-renders on every
  // store mutation. Optional call: the pre-store legacy test mirrors render
  // the rail without the store seat (useStore undefined) and simply read no
  // bookmarks.
  const bookmarkedKeys = useStore?.((s) => s.keys) ?? NO_BOOKMARKS

  // Ordered user-message dots. node.kind === 'user' is the append-origin human
  // prompt (steering/context/assistant/tool kinds are skipped).
  const marks = useMemo<MilestoneMark[]>(() => {
    const result: MilestoneMark[] = []
    for (const key of order) {
      const node = nodes.get(key)
      if (node === undefined || node.kind !== 'user') continue
      const data = node.data as { seq?: number; time?: number; content?: unknown }
      const turn = node.location.kind === 'turn' || node.location.kind === 'step'
        ? node.location.turn.turn
        : undefined
      result.push({
        key,
        turn,
        seq: data.seq ?? 0,
        time: data.time ?? 0,
        text: extractText(data.content),
        preview: extractPreview(data.content),
      })
    }
    return result
  }, [order, nodes])

  const [railBox, setRailBox] = useState<RailBox | null>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [search, setSearch] = useState<SearchState>({ query: '', activePos: 0, panelOpen: false })
  // T10: bookmarks-only filter — when on, only bookmarked dots render.
  const [bookmarksOnly, setBookmarksOnly] = useState(false)
  // Roving tabindex (T9): the dot index that owns the single tab stop.
  const [focusIndex, setFocusIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  // F2: the user message at/just above the conversation viewport top. Changes
  // whenever the scrollport scrolls (or the message set reorders), re-rendering
  // the dots so the current one carries the white ring.
  const currentKey = useCurrentAnchor(order)

  // T10: the visible dot list — the full marks list, or (filter on) the
  // bookmarked subset. EVERY downstream count (search N/M, hover N/M, roving
  // tab stop) operates on this list so the filtered view stays self-consistent.
  const displayMarks = useMemo<MilestoneMark[]>(() => {
    if (!bookmarksOnly) return marks
    return filterByBookmarks(marks, bookmarkedKeys).visible.map((i) => marks[i])
  }, [bookmarksOnly, marks, bookmarkedKeys])

  // Match list over the FULL message text. Empty query matches everything, so
  // an empty search never dims dots — `hasQuery` gates the dim styling.
  const { matches } = useMemo(
    () => filterMarks(displayMarks, search.query),
    [displayMarks, search.query],
  )
  const hasQuery = search.query.trim() !== ''
  const activeMarkIndex = hasQuery && matches.length > 0
    ? matches[Math.min(search.activePos, matches.length - 1)]
    : -1

  // Position the rail at the conversation scrollport's right edge. Depends only
  // on mark count (not mark content) so it re-runs on length changes, not on
  // every message update.
  useLayoutEffect(() => {
    if (marks.length < MIN_MARKS) {
      setRailBox(null)
      return
    }
    const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null) return
    const compute = (): void => {
      const sp = scrollport.getBoundingClientRect()
      setRailBox({
        top: sp.top,
        height: sp.height,
        right: Math.max(8, window.innerWidth - sp.right + RAIL_INSET),
      })
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(scrollport)
    window.addEventListener('resize', compute)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [marks.length])

  // Keep the roving tab stop inside the dot list when it shrinks (e.g. the
  // bookmarks-only filter narrows the dots): an out-of-range focusIndex would
  // leave the widget with NO tab stop at all.
  useLayoutEffect(() => {
    setFocusIndex((f) => clampIndex(f, displayMarks.length))
  }, [displayMarks.length])

  if (railBox === null || marks.length < MIN_MARKS) return null

  const jump = (key: string): void => {
    findRow(key)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const updateQuery = (query: string): void => {
    setSearch({ query, activePos: 0, panelOpen: true })
  }

  const clearSearch = (): void => {
    setSearch((s) => ({ ...s, query: '', activePos: 0 }))
  }

  const closeSearch = (): void => {
    setSearch({ query: '', activePos: 0, panelOpen: false })
  }

  /** Enter: cycle to the next match (wrapping) and jump to that dot's row. */
  const advanceMatch = (): void => {
    if (matches.length === 0) return
    const next = nextMatchIndex(search.activePos, matches.length, 1)
    setSearch((s) => ({ ...s, activePos: next }))
    jump(displayMarks[matches[next]].key)
  }

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') advanceMatch()
    if (e.key === 'Escape') closeSearch()
  }

  /** Focus the dot at `index` (no-op while the list is unmounted). */
  const focusDotAt = (index: number): void => {
    listRef.current?.querySelectorAll<HTMLElement>('[data-rail-dot]')[index]?.focus()
  }

  /** Tab lands on the list itself: hand focus to the dot owning the tab stop. */
  const onListFocus = (e: ReactFocusEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return
    focusDotAt(clampIndex(focusIndex, displayMarks.length))
  }

  /**
   * Roving-tabindex keys: ArrowDown/ArrowUp move focus (wrapping), Home/End
   * jump to first/last. Enter/Space are deliberately NOT handled — the dots
   * are real buttons, so native activation fires the jump click untouched
   * (preventDefault here would swallow it).
   */
  const onListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const count = displayMarks.length
    let next: number | null = null
    switch (e.key) {
      case 'ArrowDown': next = nextFocusIndex(focusIndex, count, 1); break
      case 'ArrowUp': next = nextFocusIndex(focusIndex, count, -1); break
      case 'Home': next = 0; break
      case 'End': next = count - 1; break
      default: return
    }
    e.preventDefault()
    const target = clampIndex(next, count)
    setFocusIndex(target)
    focusDotAt(target)
  }

  const buildHover = (mark: MilestoneMark, index: number): Omit<HoverInfo, 'top'> => {
    const turn = mark.turn !== undefined ? timeline.turns.get(mark.turn) : undefined
    let durationLabel: string | null = null
    let reasonLabel: string | null = null
    let ttftLabel: string | null = null
    let tpsLabel: string | null = null
    if (turn !== undefined) {
      if (turn.start !== undefined && turn.end !== undefined) {
        durationLabel = formatDuration(turn.end.time - turn.start.time)
      }
      if (turn.end !== undefined) {
        const reason = (turn.end.data as { reason?: { kind?: string } }).reason
        if (reason?.kind !== undefined) reasonLabel = reasonLabelOf(reason.kind)
      }
      const tail = turnTailOf(turn)
      if (tail !== undefined) {
        if (tail.ttftMs !== undefined) ttftLabel = formatDuration(tail.ttftMs)
        if (tail.tokensPerSecond !== undefined) tpsLabel = `${tail.tokensPerSecond.toFixed(1)} tok/s`
      }
    }
    return {
      mark,
      index,
      total: displayMarks.length,
      turnLabel: mark.turn !== undefined ? `第 ${mark.turn} 轮` : null,
      durationLabel,
      reasonLabel,
      ttftLabel,
      tpsLabel,
    }
  }

  /**
   * T10: flip a mark's bookmark in the persisted store. The store action is
   * the write path (the engine persists synchronously). The hover re-assert
   * forces a re-render so the star reflects the toggled state — production
   * re-renders through the framework's uSES-bound useStore; the component
   * test harness injects an unsubscribed selector, so this local re-render is
   * what syncs the DOM there. Both paths converge on the same fresh snapshot.
   */
  const onToggleBookmark = (key: string): void => {
    // Optional actions: legacy render paths without the store seat no-op.
    actions?.toggle(key)
    setHover((h) => (h === null ? h : { ...h }))
  }

  const dotPitch = DOT_HIT + DOT_GAP
  // F3: an earlier page exists and the rail is rendered (marks >= MIN_MARKS is
  // already guaranteed past the early return above; kept explicit so the
  // affordance's precondition reads as one named fact).
  const showLoadOlder = hasMore && marks.length >= MIN_MARKS

  return (
    <div
      style={{
        position: 'fixed',
        top: railBox.top,
        right: railBox.right,
        height: railBox.height,
        width: DOT_HIT,
        pointerEvents: 'auto',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
      aria-label="会话里程碑"
    >
      {showLoadOlder && (
        <button
          type="button"
          data-load-older
          data-loading-older={loadingOlder ? 'true' : undefined}
          title="加载更早消息"
          aria-label="加载更早消息"
          disabled={loadingOlder}
          onClick={() => { void loadOlder() }}
          style={{
            width: DOT_HIT,
            height: DOT_HIT,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: loadingOlder ? 'default' : 'pointer',
            color: loadingOlder ? '#5a6375' : '#8b96ab',
            fontSize: 11,
            lineHeight: 1,
            letterSpacing: 1,
          }}
        >
          ···
        </button>
      )}

      <button
        type="button"
        data-bookmarks-toggle
        aria-label="只看收藏"
        aria-pressed={bookmarksOnly}
        data-active={bookmarksOnly ? 'true' : undefined}
        onClick={() => setBookmarksOnly((v) => !v)}
        style={{
          width: DOT_HIT,
          height: DOT_HIT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: bookmarksOnly ? 'rgba(77, 124, 254, 0.18)' : 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: bookmarksOnly ? '#9db8ff' : '#8b96ab',
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill={bookmarksOnly ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      </button>

      <RailSearchUi
        panelTop={railBox.top}
        panelRight={railBox.right + DOT_HIT + 8}
        query={search.query}
        panelOpen={search.panelOpen}
        matches={matches.length}
        total={displayMarks.length}
        onToggle={() => setSearch((s) => ({ ...s, panelOpen: !s.panelOpen }))}
        onQueryChange={updateQuery}
        onSearchKeyDown={onSearchKeyDown}
        onClear={clearSearch}
      />

      <div
        ref={listRef}
        data-rail-list
        tabIndex={0}
        aria-label="会话里程碑列表"
        onFocus={onListFocus}
        onKeyDown={onListKeyDown}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: DOT_GAP,
          padding: '6px 0',
          scrollbarWidth: 'none',
        }}
      >
        {displayMarks.map((mark, i) => {
          // markState precedence (current > active > match > dimmed > normal):
          // F2 feeds isCurrent from useCurrentAnchor, so the dot for the row
          // at the viewport top is 'current'. While a query is active the
          // position ring stands down (search match/active states own the
          // dots — the active match keeps its aria-current); it returns when
          // the query clears. Hover styling wins over every search/position
          // state so hovering a dimmed dot still lights it.
          const bookmarked = isBookmarked(bookmarkedKeys, mark.key)
          const dotState = markState({
            key: mark.key,
            hasQuery,
            isMatch: matches.includes(i),
            isActive: i === activeMarkIndex,
            isCurrent: !hasQuery && mark.key === currentKey,
          })
          const isHovered = hover?.mark.key === mark.key
          const boxShadow = isHovered
            ? '0 0 0 3px rgba(77, 124, 254, 0.35)'
            : dotState === 'active'
              ? '0 0 0 3px rgba(255, 255, 255, 0.9)'
              : dotState === 'current'
                ? '0 0 0 3px rgba(255, 255, 255, 0.75)'
                : 'none'
          return (
            <button
              key={mark.key}
              type="button"
              style={{
                width: DOT_HIT,
                height: DOT_HIT,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                const rect = e.currentTarget.getBoundingClientRect()
                setHover({ ...buildHover(mark, i), top: rect.top + rect.height / 2 })
              }}
              onClick={() => jump(mark.key)}
              data-rail-dot
              tabIndex={focusIndex === i ? 0 : -1}
              onFocus={() => setFocusIndex(i)}
              aria-label={`跳转到第 ${i + 1} 条消息`}
              aria-current={dotState === 'active' ? 'true' : undefined}
              data-current={dotState === 'current' ? 'true' : undefined}
              data-dimmed={dotState === 'dimmed' ? 'true' : undefined}
            >
              <span
                style={{
                  width: DOT_SIZE,
                  height: DOT_SIZE,
                  borderRadius: '50%',
                  background: dotColor(i, marks.length),
                  boxShadow,
                  transition: 'transform 120ms ease, opacity 120ms ease',
                  transform: `scale(${isHovered ? 1.35 : dotState === 'active' || dotState === 'current' ? 1.25 : 1})`,
                  opacity: isHovered || dotState !== 'dimmed' ? 1 : 0.22,
                }}
                data-bookmarked={bookmarked ? 'true' : undefined}
              />
            </button>
          )
        })}
      </div>

      {hover !== null && (
        <MilestoneRailTooltip
          panelRight={railBox.right + DOT_HIT + 8}
          hover={hover}
          bookmarked={isBookmarked(bookmarkedKeys, hover.mark.key)}
          onToggleBookmark={() => onToggleBookmark(hover.mark.key)}
          // Hover stability (T10): entering the tooltip keeps hover set
          // (the dot no longer clears it on mouse-leave — the cursor must
          // cross the rail→tooltip gap); leaving the tooltip dismisses it.
          onMouseEnter={() => setHover((h) => h)}
          onMouseLeave={() => setHover(null)}
        />
      )}

      {showLoadOlder && (
        <div
          data-window-hint
          style={{
            position: 'absolute',
            bottom: 6,
            right: '100%',
            marginRight: 8,
            whiteSpace: 'nowrap',
            fontSize: 10,
            lineHeight: 1,
            color: 'rgba(139, 150, 171, 0.9)',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          已显示 {marks.length} 条 · 还有更早
        </div>
      )}
    </div>
  )
}
