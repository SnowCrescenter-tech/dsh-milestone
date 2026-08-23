/**
 * MilestoneSessionSearch: the cross-session search panel (P3) — the fixed
 * chrome pinned to the rail's top that searches EVERY session's message
 * content through the injected `searchSessions` action (the harness
 * `session.search` RPC), lists ranked hits (display title + snippet), and
 * opens the clicked session via `openSession` (the same selection path the
 * sidebar uses).
 *
 * Owns its search lifecycle — debounce + AbortController + status — unlike
 * the rail's in-session search (RailSearchUi), which is a pure presentation
 * slice of MilestoneRail's own state. Mirrors MilestoneListPanel's
 * fixed-panel styling. Renders one DOM contract
 * (`data-session-search` root / `data-session-search-input` /
 * `data-session-search-result` rows / `data-session-search-error` /
 * `data-session-search-more`).
 *
 * Outside dismissal: while the panel is mounted (it only renders while open),
 * a pointerdown anywhere outside it calls the rail-fed `onClose` (shared
 * useOutsideDismiss hook; the toggle's own click keeps its flip semantics
 * through a `[data-session-search-toggle]` exclusion).
 */
import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { outsideDismissMatches, useOutsideDismiss } from './useOutsideDismiss.ts'
import type { SessionSearchResultItemLike } from './railInject.ts'

/** Debounce window for the cross-session query (ms). */
const SEARCH_DEBOUNCE_MS = 250

/** One cross-session search hit: harness snippet plus the joined display title. */
export type SessionSearchHit = SessionSearchResultItemLike & { readonly title?: string }

/** Injected cross-session search action (`index.ts` → `createSessionSearch`). */
export type SearchSessionsFn = (
  query: string,
  signal: AbortSignal,
) => Promise<{ items: readonly SessionSearchHit[]; hasMore: boolean }>

/** Panel body states — idle and loading render no body; empty renders no rows. */
type SearchStatus = 'idle' | 'loading' | 'results' | 'empty' | 'error'

export interface MilestoneSessionSearchProps {
  /** Panel anchor: the rail's viewport top (px). */
  readonly panelTop: number
  /** Panel anchor: the rail's viewport right offset (px); panel sits left of it. */
  readonly panelRight: number
  /** Close the panel (Escape on the input, or the rail's own toggle). */
  readonly onClose: () => void
  /** The injected cross-session search action (railInject.ts). */
  readonly searchSessions: SearchSessionsFn
  /** The injected open-session action (railInject.ts). */
  readonly openSession: (id: string) => void
  /** Locale interpreter: resolves `dsh-milestone` dictionary keys (from MilestoneRail). */
  readonly t: TranslateNS<'dsh-milestone'>
}

/**
 * @param props - the panel anchor, the close/open/search actions, and the locale interpreter.
 */
export function MilestoneSessionSearch({
  panelTop,
  panelRight,
  onClose,
  searchSessions,
  openSession,
  t,
}: MilestoneSessionSearchProps) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [hits, setHits] = useState<readonly SessionSearchHit[]>([])
  const [hasMore, setHasMore] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  // The panel is only mounted while open, so `open` is a constant true;
  // closing = unmount, which runs the hook's cleanup.
  useOutsideDismiss(panelRef, true, onClose, {
    exclude: (target) => outsideDismissMatches(target, '[data-session-search-toggle]'),
  })

  // Debounced search: every query change cancels the pending timer AND the
  // in-flight RPC (the signal is passed through, so a superseded search is
  // aborted at the transport); a settled-but-stale response is dropped on
  // the aborted guard. Unmount runs the same cleanup — no leaked timers.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') {
      setStatus('idle')
      return
    }
    const controller = new AbortController()
    setStatus('loading')
    const timer = window.setTimeout(() => {
      void searchSessions(trimmed, controller.signal).then(
        (result) => {
          if (controller.signal.aborted) return
          setHits(result.items)
          setHasMore(result.hasMore)
          setStatus(result.items.length > 0 ? 'results' : 'empty')
        },
        () => {
          if (controller.signal.aborted) return
          setStatus('error')
        },
      )
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query, searchSessions])

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') onClose()
  }

  return (
    <div
      ref={panelRef}
      data-session-search
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
          zero-asset — same pattern as MilestoneListPanel. */}
      <style>{`[data-session-search-result]:hover { background: rgba(77, 124, 254, 0.18); }`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee' }}>{t('search.cross')}</span>
      </div>
      <input
        data-session-search-input
        aria-label={t('search.cross')}
        placeholder={t('search.cross')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onInputKeyDown}
        autoFocus
        style={{
          boxSizing: 'border-box',
          width: '100%',
          padding: '6px 10px',
          fontSize: 14,
          lineHeight: 1.4,
          color: '#e6e8ee',
          background: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.16)',
          borderRadius: 6,
          outline: 'none',
        }}
      />
      {status === 'error' && (
        <div data-session-search-error style={{ marginTop: 8, fontSize: 13, color: '#f07c7c' }}>
          {t('search.error')}
        </div>
      )}
      {status === 'results' && (
        <>
          <div
            style={{
              maxHeight: 300,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              marginTop: 8,
            }}
          >
            {hits.map((hit) => (
              <button
                key={hit.sessionId}
                type="button"
                data-session-search-result
                onClick={() => {
                  openSession(hit.sessionId)
                  onClose()
                }}
                title={hit.snippet}
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
                <div
                  style={{
                    fontSize: 12,
                    color: '#9db8ff',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {hit.title ?? t('search.untitled')}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    lineHeight: 1.4,
                    color: '#c6ccd8',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {hit.snippet}
                </div>
              </button>
            ))}
          </div>
          {hasMore && (
            <div data-session-search-more style={{ marginTop: 6, fontSize: 12, color: '#8b96ab' }}>
              {t('search.more')}
            </div>
          )}
        </>
      )}
    </div>
  )
}
