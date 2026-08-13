/**
 * MilestoneRailTooltip: the hover tooltip chrome of the milestone rail.
 *
 * Owns no state: MilestoneRail feeds the hovered mark's metadata, the
 * bookmark flag, the star-toggle callback, the copy/fork action callbacks
 * (with their transient acknowledgement flags), and the mouse handlers that
 * keep the tooltip alive while the cursor crosses the rail→tooltip gap.
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
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { relativeTimeParts } from './label-logic'
import type { MilestoneKey } from './locales.ts'
import type { HoverInfo } from './MilestoneRail.tsx'

export interface MilestoneRailTooltipProps {
  /** Hovered mark metadata: position, preview, and the turn/end/TTFT/tps labels. */
  readonly hover: HoverInfo
  /** Whether the hovered mark is bookmarked (drives `aria-pressed`/`data-starred`). */
  readonly bookmarked: boolean
  /** Star toggle: flips the hovered mark's bookmark in the persisted store. */
  readonly onToggleBookmark: () => void
  /** Copy action: copies the hovered mark's FULL text (async; resolves false on failure). */
  readonly onCopy: (mark: HoverInfo['mark']) => Promise<void>
  /** Fork action: forks the session at the hovered mark's seq (resolves a child session id). */
  readonly onFork: (mark: HoverInfo['mark']) => void
  /** Whether the copy acknowledgement is showing for the hovered mark. */
  readonly copied: boolean
  /** Whether the fork acknowledgement is showing for the hovered mark. */
  readonly forked: boolean
  /**
   * C4: whether the hovered mark's turn is currently collapsed (read LIVE
   * from the rail's collapsedTurns state, so the label / aria-pressed flip
   * the moment the turn toggles).
   */
  readonly turnCollapsed: boolean
  /** C4: collapse/expand the hovered mark's turn (turn number; only present when `turnMarkCount > 1`). */
  readonly onToggleCollapse: (turn: number) => void
  /** Keep hover set while the cursor is over the tooltip. */
  readonly onMouseEnter: () => void
  /** Dismiss the tooltip once the cursor leaves it. */
  readonly onMouseLeave: () => void
  /** Horizontal anchor: viewport-right offset the tooltip hugs (px). */
  readonly panelRight: number
  /** Locale interpreter: resolves `dsh-milestone` dictionary keys (from MilestoneRail). */
  readonly t: TranslateNS<'dsh-milestone'>
}

/**
 * @param props - the hovered mark + bookmark wiring (see {@link MilestoneRailTooltipProps}).
 */
export function MilestoneRailTooltip({
  hover,
  bookmarked,
  onToggleBookmark,
  onCopy,
  onFork,
  copied,
  forked,
  turnCollapsed,
  onToggleCollapse,
  onMouseEnter,
  onMouseLeave,
  panelRight,
  t,
}: MilestoneRailTooltipProps) {
  const relativeTime = relativeTimeParts(hover.mark.time, Date.now())
  // C4: the collapse action only exists for turns with more than one mark.
  // `turn` is captured before JSX so the onClick closure sees the narrowed
  // number type.
  const turn = hover.mark.turn
  const showCollapse = turn !== undefined && hover.turnMarkCount !== null && hover.turnMarkCount > 1
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
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, color: '#9aa4b8', fontSize: 11, marginBottom: 4 }}>
        <span>{t('pos.of', { n: hover.index + 1, m: hover.total })}</span>
        {hover.turnLabel !== null && <span>{hover.turnLabel}</span>}
        <button
          type="button"
          data-star
          aria-label={t('bookmark.star')}
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
        <button
          type="button"
          data-copy-message
          data-copied={copied ? 'true' : undefined}
          onClick={(e) => {
            e.stopPropagation()
            void onCopy(hover.mark)
          }}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: '2px 6px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            color: copied ? '#7ee2a8' : '#8b96ab',
          }}
        >
          {t('copy.message')}
        </button>
        <button
          type="button"
          data-fork-here
          data-forked={forked ? 'true' : undefined}
          onClick={(e) => {
            e.stopPropagation()
            onFork(hover.mark)
          }}
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: '2px 6px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            color: forked ? '#7ee2a8' : '#8b96ab',
          }}
        >
          {t('fork.here')}
        </button>
        {showCollapse && turn !== undefined && (
          <button
            type="button"
            data-toggle-collapse
            aria-pressed={turnCollapsed}
            data-collapsed={turnCollapsed ? 'true' : undefined}
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse(turn)
            }}
            style={{
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'transparent',
              border: 'none',
              padding: '2px 6px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              color: turnCollapsed ? '#7ee2a8' : '#8b96ab',
            }}
          >
            {turnCollapsed ? t('expand.turn') : t('collapse.turn')}
          </button>
        )}
      </div>
      <div style={{ color: '#c7cede' }}>{hover.mark.preview !== '' ? hover.mark.preview : t('no.text')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, color: '#8b96ab', fontSize: 11, marginTop: 4 }}>
        <span>{t(relativeTime.key, { n: relativeTime.n })}</span>
        {hover.durationLabel !== null && <span>{t('duration.label', { name: hover.durationLabel })}</span>}
        {hover.reasonLabel !== null && <span>{hover.reasonLabel}</span>}
        {hover.ttftLabel !== null && <span>{t('ttft.label', { name: hover.ttftLabel })}</span>}
        {hover.tpsLabel !== null && <span>{hover.tpsLabel}</span>}
      </div>
      {(hover.modelLabel !== null || hover.purposeLabel !== null || hover.tokensLabel !== null) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, color: '#8b96ab', fontSize: 11, marginTop: 4 }}>
          {hover.modelLabel !== null && <span data-model={hover.modelLabel}>{hover.modelLabel}</span>}
          {hover.purposeLabel !== null && <span data-purpose={hover.purposeLabel}>{hover.purposeLabel}</span>}
          {hover.tokensLabel !== null && <span data-tokens={hover.tokensLabel}>{hover.tokensLabel}</span>}
        </div>
      )}
    </div>
  )
}
