/**
 * RailSearchUi: the in-rail search chrome (F1) — the magnifier toggle pinned
 * to the rail's top and the compact search panel to its left (input, match
 * counter, clear button).
 *
 * Pure presentation: it owns no state. MilestoneRail holds the search state
 * and handlers and feeds them in as props, so the search lifecycle (query,
 * match cycle, escape semantics) stays component-local in the rail. Splitting
 * the chrome into its own file keeps the rail component under the size
 * ceiling while the two still render one DOM contract
 * (`data-search-toggle` / `data-rail-search` / `data-match-count` /
 * `data-search-clear`).
 */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

/** Dot diameter (px) — matches the rail's DOT_HIT so the toggle aligns. */
const DOT_HIT = 22

export interface RailSearchUiProps {
  /** Panel anchor: the rail's viewport top (px). */
  readonly panelTop: number
  /** Panel anchor: the rail's viewport right offset (px); panel sits left of it. */
  readonly panelRight: number
  readonly query: string
  readonly panelOpen: boolean
  /** Number of matching marks (search active) / marks total, for the N/M counter. */
  readonly matches: number
  readonly total: number
  readonly onToggle: () => void
  readonly onQueryChange: (query: string) => void
  readonly onSearchKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void
  readonly onClear: () => void
}

/**
 * @param props - the search state slice plus the rail's event handlers.
 */
export function RailSearchUi({
  panelTop,
  panelRight,
  query,
  panelOpen,
  matches,
  total,
  onToggle,
  onQueryChange,
  onSearchKeyDown,
  onClear,
}: RailSearchUiProps) {
  return (
    <>
      <button
        type="button"
        data-search-toggle
        aria-label="搜索消息"
        aria-pressed={panelOpen}
        onClick={onToggle}
        style={{
          width: DOT_HIT,
          height: DOT_HIT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: panelOpen ? 'rgba(77, 124, 254, 0.18)' : 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: panelOpen ? '#9db8ff' : '#8b96ab',
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>

      {panelOpen && (
        <div
          style={{
            position: 'fixed',
            top: panelTop,
            right: panelRight,
            width: 220,
            padding: '10px 12px',
            background: 'rgba(20, 24, 32, 0.97)',
            color: '#e6e8ee',
            borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
            zIndex: 102,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              data-rail-search
              aria-label="搜索消息"
              placeholder="搜索消息内容"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              autoFocus
              style={{
                flex: 1,
                minWidth: 0,
                padding: '5px 8px',
                fontSize: 12,
                color: '#e6e8ee',
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                borderRadius: 6,
                outline: 'none',
              }}
            />
            <button
              type="button"
              data-search-clear
              aria-label="清空搜索"
              onClick={onClear}
              style={{
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
                color: '#8b96ab',
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div data-match-count style={{ marginTop: 6, fontSize: 11, color: '#8b96ab' }}>
            {matches}/{total}
          </div>
        </div>
      )}
    </>
  )
}
