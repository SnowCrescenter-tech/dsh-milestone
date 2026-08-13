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
 */
import { useLayoutEffect, useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { dotColor, extractText, filterMarks, markState, nextMatchIndex } from './rail-logic'
import { RailSearchUi } from './MilestoneRailSearch.tsx'
import { useCurrentAnchor } from './useCurrentAnchor.ts'

export type MilestoneRailProps = PropsRuntime<'milestone.rail'>

/** Minimum user messages before the rail adds value. */
const MIN_MARKS = 2
const PREVIEW_LENGTH = 80
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

interface HoverInfo {
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

/** Relative wall-clock label for a Unix-epoch-ms timestamp. */
function formatRelativeTime(time: number): string {
  const diff = Date.now() - time
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
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
 * @param props - session standard kit (useSession, sessionId, useProjection).
 */
export function MilestoneRail({ useSession }: MilestoneRailProps) {
  const order = useSession(s => s.chat.order)
  const nodes = useSession(s => s.chat.nodes)
  const timeline = useSession(s => s.chat.timeline)

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
  // F2: the user message at/just above the conversation viewport top. Changes
  // whenever the scrollport scrolls (or the message set reorders), re-rendering
  // the dots so the current one carries the white ring.
  const currentKey = useCurrentAnchor(order)

  // Match list over the FULL message text. Empty query matches everything, so
  // an empty search never dims dots — `hasQuery` gates the dim styling.
  const { matches } = useMemo(() => filterMarks(marks, search.query), [marks, search.query])
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
    jump(marks[matches[next]].key)
  }

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') advanceMatch()
    if (e.key === 'Escape') closeSearch()
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
      total: marks.length,
      turnLabel: mark.turn !== undefined ? `第 ${mark.turn} 轮` : null,
      durationLabel,
      reasonLabel,
      ttftLabel,
      tpsLabel,
    }
  }

  const dotPitch = DOT_HIT + DOT_GAP

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
      <RailSearchUi
        panelTop={railBox.top}
        panelRight={railBox.right + DOT_HIT + 8}
        query={search.query}
        panelOpen={search.panelOpen}
        matches={matches.length}
        total={marks.length}
        onToggle={() => setSearch((s) => ({ ...s, panelOpen: !s.panelOpen }))}
        onQueryChange={updateQuery}
        onSearchKeyDown={onSearchKeyDown}
        onClear={clearSearch}
      />

      <div
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
        {marks.map((mark, i) => {
          // markState precedence (current > active > match > dimmed > normal):
          // F2 feeds isCurrent from useCurrentAnchor, so the dot for the row
          // at the viewport top is 'current'. While a query is active the
          // position ring stands down (search match/active states own the
          // dots — the active match keeps its aria-current); it returns when
          // the query clears. Hover styling wins over every search/position
          // state so hovering a dimmed dot still lights it.
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
              onMouseLeave={() => setHover(null)}
              onClick={() => jump(mark.key)}
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
              />
            </button>
          )
        })}
      </div>

      {hover !== null && (
        <div
          style={{
            position: 'fixed',
            right: railBox.right + DOT_HIT + 8,
            top: hover.top,
            transform: 'translateY(-50%)',
            maxWidth: 300,
            minWidth: 180,
            padding: '8px 12px',
            background: 'rgba(20, 24, 32, 0.96)',
            color: '#e6e8ee',
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
            zIndex: 101,
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', gap: 8, color: '#9aa4b8', fontSize: 11, marginBottom: 4 }}>
            <span>第 {hover.index + 1} / {hover.total} 条</span>
            {hover.turnLabel !== null && <span>{hover.turnLabel}</span>}
          </div>
          <div style={{ color: '#c7cede' }}>{hover.mark.preview !== '' ? hover.mark.preview : '（无文本）'}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, color: '#8b96ab', fontSize: 11, marginTop: 4 }}>
            <span>{formatRelativeTime(hover.mark.time)}</span>
            {hover.durationLabel !== null && <span>用时 {hover.durationLabel}</span>}
            {hover.reasonLabel !== null && <span>{hover.reasonLabel}</span>}
            {hover.ttftLabel !== null && <span>首字 {hover.ttftLabel}</span>}
            {hover.tpsLabel !== null && <span>{hover.tpsLabel}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
