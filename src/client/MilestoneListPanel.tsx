/**
 * MilestoneListPanel: the expandable all-prompts panel (P3) — the compact
 * list chrome pinned to the rail's top that enumerates EVERY user-prompt
 * milestone (序号 + turn + preview), independent of the search/bookmarks
 * filters. Clicking an entry jumps to that message through the rail's own
 * `jump` handler (the same path the dots use).
 *
 * Pure presentation: it owns no state. MilestoneRail holds the `listOpen`
 * boolean (the toggle and the Escape/close semantics live there) and feeds
 * the panel its anchor, the full marks array, and the jump handler as props
 * — same split as RailSearchUi. Renders one DOM contract
 * (`data-milestone-list` root / `data-list-item` rows with `data-jump-key`).
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** One list entry: the mark slice the list panel renders. */
interface ListMark {
  readonly key: string
  readonly turn: number | undefined
  readonly seq: number
  /** First 80 chars of the message — the single-line row preview. */
  readonly preview: string
}

export interface MilestoneListPanelProps {
  /** Panel anchor: the rail's viewport top (px). */
  readonly panelTop: number
  /** Panel anchor: the rail's viewport right offset (px); panel sits left of it. */
  readonly panelRight: number
  /** ALL user-prompt marks, unfiltered by search/bookmarks. */
  readonly marks: readonly ListMark[]
  /** The rail's jump handler: scrolls the `[data-chat-anchor-key]` row into view. */
  readonly onJump: (key: string) => void
  /** Locale interpreter: resolves `dsh-milestone` dictionary keys (from MilestoneRail). */
  readonly t: TranslateNS<'dsh-milestone'>
}

/**
 * @param props - the panel anchor, the full marks array, and the rail's jump handler.
 */
export function MilestoneListPanel({ panelTop, panelRight, marks, onJump, t }: MilestoneListPanelProps) {
  return (
    <div
      data-milestone-list
      style={{
        position: 'fixed',
        top: panelTop,
        right: panelRight,
        // Clamp so the panel never overflows a narrow viewport.
        width: 'min(280px, calc(100vw - 48px))',
        padding: '10px 12px',
        background: 'rgba(20, 24, 32, 0.97)',
        color: '#e6e8ee',
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
        zIndex: 103,
      }}
    >
      {/* Row hover highlight, kept in an inline <style> so the plugin stays
          zero-asset — same pattern as the rail's BADGE_PULSE_CSS. */}
      <style>{`[data-list-item]:hover { background: rgba(77, 124, 254, 0.18); }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee' }}>{t('list.label')}</span>
        <span style={{ fontSize: 12, color: '#8b96ab' }}>{marks.length}</span>
      </div>
      <div
        style={{
          maxHeight: 300,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {marks.map((mark, i) => (
          <button
            key={mark.key}
            type="button"
            data-list-item
            data-jump-key={mark.key}
            onClick={() => onJump(mark.key)}
            title={mark.preview}
            style={{
              display: 'block',
              width: '100%',
              minWidth: 0,
              padding: '6px 8px',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#e6e8ee',
              textAlign: 'left',
            }}
          >
            <div style={{ fontSize: 12, color: '#8b96ab', whiteSpace: 'nowrap' }}>
              {t('pos.of', { n: i + 1, m: marks.length })}
              {mark.turn !== undefined ? ` · ${t('turn.label', { n: mark.turn })}` : null}
            </div>
            <div
              style={{
                fontSize: 13,
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {mark.preview || t('no.text')}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
