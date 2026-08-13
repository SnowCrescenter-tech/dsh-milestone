/**
 * MilestoneRailTooltip: the hover tooltip chrome of the milestone rail.
 *
 * Owns no state: MilestoneRail feeds the hovered mark's metadata, the
 * bookmark flag, the star-toggle callback, and the mouse handlers that keep
 * the tooltip alive while the cursor crosses the rail→tooltip gap.
 *
 * Hover stability (T10): the wrapper is pointer-event-bearing
 * (`pointerEvents: 'auto'`), so its star toggle is clickable AND so
 * entering/leaving the wrapper decides when hover ends. The DOT no longer
 * clears hover on mouse-leave (the cursor must traverse the 8px gap to
 * reach the tooltip) — the wrapper's own onMouseLeave is what dismisses it,
 * and its onMouseEnter re-asserts hover so the crossing never unmounts the
 * tooltip mid-flight.
 *
 * The existing content (preview / relative time / turn / duration / end
 * reason / TTFT / tokens-per-second) is preserved untouched; only the star
 * toggle and the pointer-events/hover semantics were added.
 */
import type { HoverInfo } from './MilestoneRail.tsx'

export interface MilestoneRailTooltipProps {
  /** Hovered mark metadata: position, preview, and the turn/end/TTFT/tps labels. */
  readonly hover: HoverInfo
  /** Whether the hovered mark is bookmarked (drives `aria-pressed`/`data-starred`). */
  readonly bookmarked: boolean
  /** Star toggle: flips the hovered mark's bookmark in the persisted store. */
  readonly onToggleBookmark: () => void
  /** Keep hover set while the cursor is over the tooltip. */
  readonly onMouseEnter: () => void
  /** Dismiss the tooltip once the cursor leaves it. */
  readonly onMouseLeave: () => void
  /** Horizontal anchor: viewport-right offset the tooltip hugs (px). */
  readonly panelRight: number
}

/**
 * @param props - the hovered mark + bookmark wiring (see {@link MilestoneRailTooltipProps}).
 */
export function MilestoneRailTooltip({
  hover,
  bookmarked,
  onToggleBookmark,
  onMouseEnter,
  onMouseLeave,
  panelRight,
}: MilestoneRailTooltipProps) {
  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        right: panelRight,
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
        pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9aa4b8', fontSize: 11, marginBottom: 4 }}>
        <span>第 {hover.index + 1} / {hover.total} 条</span>
        {hover.turnLabel !== null && <span>{hover.turnLabel}</span>}
        <button
          type="button"
          data-star
          aria-label="收藏此消息"
          aria-pressed={bookmarked}
          data-starred={bookmarked ? 'true' : undefined}
          onClick={(e) => {
            e.stopPropagation()
            onToggleBookmark()
          }}
          style={{
            marginLeft: 'auto',
            width: 22,
            height: 22,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: bookmarked ? '#ffd166' : '#8b96ab',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill={bookmarked ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
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
  )
}

/** Relative wall-clock label for a Unix-epoch-ms timestamp. */
function formatRelativeTime(time: number): string {
  const diff = Date.now() - time
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${Math.floor(diff / 86_400_000)} 天前`
}
