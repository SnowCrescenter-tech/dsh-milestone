/**
 * MilestoneTour: the 0.6.5 first-run coach-bubble tutorial.
 *
 * Unlike the deleted 0.6.4 MilestoneOnboarding modal (built-in toy demos on a
 * fake overlay), this tour never fakes anything. Each of the 5 bubbles anchors
 * a REAL rail element (`data-rail-list`, `data-toolbar-expand`,
 * `data-toolbar-settings`, the first `data-rail-dot`, the rail root), explains
 * what clicking that control ACTUALLY does, and auto-advances by OBSERVING the
 * live state the rail already owns:
 *   - bubble 1 (expand arrow) waits for `toolbarExpanded` → true — the user
 *     really clicked the arrow (「下一步」 remains a fallback);
 *   - bubble 2 (settings gear) waits for `settingsOpen` → true — the settings
 *     panel appearing IS the proof — and SUSPENDS while the modal is open
 *     (state is kept; closing settings resumes the bubble at the current step);
 *   - bubble 3 (dots) needs no interaction — hover/click are explained.
 *
 * Trigger/ownership lives in MilestoneRail (mount timer + settings reopen);
 * this component is presentation + state machine only. It persists the
 * `dsh-milestone.onboarded` flag itself via onboarding-store on IMPRESSION
 * (showing bubble 0 is enough) and on every close path (skip / Esc / finish).
 *
 * Positioning: `position: fixed`, opened on the target's FREE side (rail on
 * the right → bubble left of the target; rail on the left → bubble right of
 * it), measured with getBoundingClientRect and clamped to the viewport.
 * Re-measured on step changes, whenever the anchor may have (un)mounted (the
 * forced toolbar expansion), and on window resize. There is NO overlay and the
 * bubble never covers its own target — the user is supposed to CLICK the real
 * controls, so pointer-events live only on the bubble box itself.
 *
 * Anchor guarantee: entering any step ≥ 2 calls `onSetToolbarExpanded(true)`
 * because `data-toolbar-settings` renders only while the toolbar is expanded
 * (or the gear pinned) — the 「下一步」 fallback path lands there un-expanded.
 *
 * Visual language reuses modal-tokens (MODAL_TIP_BG panel, one border tone,
 * the 12/8px radius scale, three text tiers) and the rail root's inherited
 * `--ms-accent*` CSS variables. The highlight ring is zero-asset: a
 * `data-tour-highlight` attribute + one injected CSS rule.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  MODAL_BORDER,
  MODAL_FG,
  MODAL_HINT,
  MODAL_RADIUS_CONTROL,
  MODAL_RADIUS_PANEL,
  MODAL_TEXT,
  MODAL_TIP_BG,
} from './modal-tokens'
import { writeOnboardedFlag } from './onboarding-store'
import type { MilestoneKey } from './locales.ts'

/** The tour bubble floats above every other rail layer (settings overlay 105). */
const TOUR_Z = 106
/** Gap between the target element and the bubble (px). */
const TOUR_GAP = 12
/** Bubble width (px) — the left-edge positioning math clamps against it. */
const TOUR_WIDTH = 280
/** Minimum padding between the bubble and the viewport edges (px). */
const VIEWPORT_PAD = 8
/** Fallback bubble height used when the layout has not settled (px). */
const TOUR_HEIGHT_FALLBACK = 120
/** Progress-dot count — the 5 bubble steps (0 = welcome … 4 = done). */
const STEP_COUNT = [0, 1, 2, 3, 4] as const

/**
 * Static tour styling that `:hover`/`:focus-visible`/reduced-motion need (the
 * `:focus-visible` ring and the base-state backgrounds inline styles cannot
 * duplicate). BASE-states first — the UA default button face must never flood
 * through on the dark bubble (that exact bug already shipped once).
 */
const TOUR_CSS = `
@keyframes ms-tour-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
[data-tour-bubble] { animation: ms-tour-fade 160ms ease; }
/* BASE-state backgrounds for every bubble control (transparent or themed). */
[data-tour-skip] { background: transparent; }
[data-tour-prev] { background: rgba(255, 255, 255, 0.06); }
[data-tour-primary] { background: var(--ms-accent-bg); color: var(--ms-accent-soft); }
/* Hover washes on top of the explicit base states. */
[data-tour-skip]:hover { background: rgba(255, 255, 255, 0.08); }
[data-tour-prev]:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); }
[data-tour-primary]:hover { background: rgba(255, 255, 255, 0.14); }
/* ONE accent focus ring for keyboard use. */
[data-tour-skip]:focus-visible, [data-tour-prev]:focus-visible, [data-tour-primary]:focus-visible {
  box-shadow: 0 0 0 2px var(--ms-accent-soft);
}
/* The real-target highlight ring: accent halo + a subtle scale hint. */
[data-tour-highlight] {
  box-shadow: 0 0 0 2px var(--ms-accent-soft), 0 0 0 4px var(--ms-accent);
  transform: scale(1.04);
  transition: box-shadow 140ms ease, transform 140ms ease;
}
@media (prefers-reduced-motion: reduce) {
  [data-tour-bubble] { animation: none; }
  [data-tour-highlight] { transform: none; transition: none; }
  [data-tour-skip], [data-tour-prev], [data-tour-primary] { transition: none; }
}
`

export interface MilestoneTourProps {
  readonly t: TranslateNS<'dsh-milestone'>
  /** Rail side — the bubble opens on the target's FREE side (left rail → right, right rail → left). */
  readonly side: 'left' | 'right'
  /** LIVE rail state — bubble 1 auto-advances when this flips true. */
  readonly toolbarExpanded: boolean
  /** LIVE rail state — bubble 2 auto-advances when this flips true, and the bubble suspends while it is true. */
  readonly settingsOpen: boolean
  /** Rail action: force the toolbar open (entering step ≥ 2 guarantees the gear anchor exists). */
  readonly onSetToolbarExpanded: (expanded: boolean) => void
  /** Parent closes the tour (the flag is persisted HERE on every close path). */
  readonly onClose: () => void
}

/** One tour bubble: its copy keys and the REAL element it anchors to. */
interface TourStepDef {
  readonly titleKey: MilestoneKey
  readonly descKey: MilestoneKey
  /** Resolves the current anchor from the live DOM (may be null while unmounted). */
  readonly anchor: () => HTMLElement | null
}

/** Rail root — every step's fallback anchor and bubble 4's target. */
function railRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-side]')
}

const STEP_DEFS: readonly TourStepDef[] = [
  {
    titleKey: 'tour.welcome.title',
    descKey: 'tour.welcome.desc',
    anchor: () => document.querySelector<HTMLElement>('[data-rail-list]'),
  },
  {
    titleKey: 'tour.step1.title',
    descKey: 'tour.step1.desc',
    anchor: () => document.querySelector<HTMLElement>('[data-toolbar-expand]'),
  },
  {
    titleKey: 'tour.step2.title',
    descKey: 'tour.step2.desc',
    anchor: () => document.querySelector<HTMLElement>('[data-toolbar-settings]'),
  },
  {
    titleKey: 'tour.step3.title',
    descKey: 'tour.step3.desc',
    anchor: () => document.querySelector<HTMLElement>('[data-rail-dot]') ?? railRoot(),
  },
  {
    titleKey: 'tour.step4.title',
    descKey: 'tour.step4.desc',
    anchor: () => railRoot(),
  },
]

/** Clamp `value` into [min, max], never letting min exceed max. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

export function MilestoneTour({
  t,
  side,
  toolbarExpanded,
  settingsOpen,
  onSetToolbarExpanded,
  onClose,
}: MilestoneTourProps) {
  const [step, setStep] = useState(0)
  const [pos, setPos] = useState<Pick<CSSProperties, 'left' | 'top'> | null>(null)
  const bubbleRef = useRef<HTMLDivElement>(null)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const stepDef = STEP_DEFS[step]

  // 印象即持久化: merely SHOWING bubble 0 marks the tour seen. Runs on mount,
  // before any interaction — a user who closes the page mid-tour (or crashes)
  // will not see it again; replay lives in settings 重新查看教程.
  useEffect(() => {
    writeOnboardedFlag()
  }, [])

  /** Skip / finish / Escape converge here: persist, then close. */
  const finish = useCallback((): void => {
    writeOnboardedFlag()
    onClose()
  }, [onClose])

  // Escape === skip (persist + close) — but NEVER while the settings modal is
  // open: that Escape belongs to settings (a dismissal keystroke must not also
  // swallow the tour).
  useEffect(() => {
    if (settingsOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish, settingsOpen])

  // Bubble 1 → 2: the user REALLY clicked the expand arrow (toolbarExpanded).
  useEffect(() => {
    if (step === 1 && toolbarExpanded) setStep(2)
  }, [step, toolbarExpanded])

  // Bubble 2 → 3: the user REALLY opened settings — the panel appearing is
  // the proof. While the modal stays open the bubble is suspended below.
  useEffect(() => {
    if (step === 2 && settingsOpen) setStep(3)
  }, [step, settingsOpen])

  // Anchor guarantee: steps ≥ 2 need the gear, which renders only while the
  // toolbar is expanded (or the gear pinned). Force-expand on entering step 2+
  // so the anchor always exists — the 「下一步」 fallback lands here un-expanded.
  useEffect(() => {
    if (step >= 2 && !toolbarExpanded) onSetToolbarExpanded(true)
  }, [step, toolbarExpanded, onSetToolbarExpanded])

  /** Measure the current anchor and place the bubble on its free side. */
  const measure = useCallback((): void => {
    const anchor = STEP_DEFS[step].anchor()
    const bubble = bubbleRef.current
    if (anchor === null || bubble === null) {
      setPos(null)
      return
    }
    const rect = anchor.getBoundingClientRect()
    const bw = bubble.offsetWidth || TOUR_WIDTH
    const bh = bubble.offsetHeight || TOUR_HEIGHT_FALLBACK
    const rawLeft = side === 'left' ? rect.right + TOUR_GAP : rect.left - TOUR_GAP - bw
    const left = clamp(rawLeft, VIEWPORT_PAD, window.innerWidth - bw - VIEWPORT_PAD)
    const rawTop = rect.top + rect.height / 2 - bh / 2
    const top = clamp(rawTop, VIEWPORT_PAD, window.innerHeight - bh - VIEWPORT_PAD)
    setPos({ left, top })
  }, [step, side])

  // Re-measure on step changes AND whenever the DOM may have reshaped the
  // target (the forced toolbar expansion mounts the gear mid-bubble-2), plus
  // window resize. useLayoutEffect keeps the placement settled before paint —
  // the bubble never flashes at an un-clamped position.
  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, toolbarExpanded, settingsOpen])

  // Highlight ring: exactly ONE target at a time. Remove the attribute from
  // every element before applying it to the current anchor; the cleanup also
  // strips it on unmount so an exiting tour never leaves a stale ring. Re-run
  // whenever the anchor may have (un)mounted (forced toolbar expansion).
  useEffect(() => {
    document
      .querySelectorAll<HTMLElement>('[data-tour-highlight]')
      .forEach((el) => el.removeAttribute('data-tour-highlight'))
    const anchor = STEP_DEFS[step].anchor()
    if (anchor !== null) anchor.setAttribute('data-tour-highlight', '')
    return () => {
      document
        .querySelectorAll<HTMLElement>('[data-tour-highlight]')
        .forEach((el) => el.removeAttribute('data-tour-highlight'))
    }
  }, [step, toolbarExpanded, settingsOpen])

  // Step changes hand focus to the bubble's primary action (开始使用/下一步).
  // The suspended renders skip it: while settings is open the bubble is not in
  // the DOM, and we must not steal focus from the settings modal.
  useEffect(() => {
    if (settingsOpen) return
    primaryRef.current?.focus()
  }, [step, settingsOpen])

  const goNext = (): void => setStep((s) => Math.min(STEP_COUNT.length - 1, s + 1))
  const goPrev = (): void => setStep((s) => Math.max(0, s - 1))

  // 挂起: during the settings modal, render nothing but KEEP every bit of
  // state — closing settings resumes the bubble at the current step.
  if (settingsOpen) return null

  const isLast = step === STEP_COUNT.length - 1
  const primaryLabel = step === 0 || isLast ? t('tour.start') : t('tour.next')

  return (
    <div
      ref={bubbleRef}
      data-tour-bubble
      data-tour-step={step}
      role="dialog"
      aria-label={t(stepDef.titleKey)}
      style={{
        position: 'fixed',
        left: pos?.left,
        top: pos?.top,
        width: TOUR_WIDTH,
        maxWidth: 'calc(100vw - 24px)',
        boxSizing: 'border-box',
        zIndex: TOUR_Z,
        padding: 14,
        background: MODAL_TIP_BG,
        color: MODAL_FG,
        borderRadius: MODAL_RADIUS_PANEL,
        border: `1px solid ${MODAL_BORDER}`,
        boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
      }}
    >
      <style>{TOUR_CSS}</style>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div data-tour-title style={{ fontSize: 14, fontWeight: 700, color: MODAL_FG, lineHeight: 1.35 }}>
          {t(stepDef.titleKey)}
        </div>
        <button
          type="button"
          data-tour-skip
          onClick={finish}
          style={{
            flexShrink: 0,
            // Explicit base background — the UA default button face must never
            // flood through on the dark bubble.
            background: 'transparent',
            border: 'none',
            padding: '2px 6px',
            borderRadius: MODAL_RADIUS_CONTROL,
            cursor: 'pointer',
            color: MODAL_HINT,
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {t('tour.skip')}
        </button>
      </div>
      <div data-tour-desc style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.5, color: MODAL_TEXT }}>
        {t(stepDef.descKey)}
      </div>
      <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12 }}>
        <button
          type="button"
          data-tour-prev
          disabled={step === 0}
          onClick={goPrev}
          style={{
            flexShrink: 0,
            background: 'rgba(255, 255, 255, 0.06)',
            border: `1px solid ${MODAL_BORDER}`,
            borderRadius: MODAL_RADIUS_CONTROL,
            padding: '5px 12px',
            cursor: step === 0 ? 'default' : 'pointer',
            color: step === 0 ? MODAL_HINT : MODAL_TEXT,
            fontSize: 12,
            lineHeight: 1.4,
            opacity: step === 0 ? 0.55 : 1,
          }}
        >
          {t('tour.prev')}
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, minWidth: 74 }}>
          <div data-tour-progress style={{ fontSize: 11.5, color: MODAL_HINT, lineHeight: 1.2 }}>
            {t('tour.step.label', { n: step + 1 })}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {STEP_COUNT.map((n) => (
              <span
                key={n}
                data-tour-progress-dot
                data-active={step === n ? 'true' : undefined}
                aria-label={t('tour.step.short', { n: n + 1 })}
                aria-current={step === n ? 'step' : undefined}
                style={{
                  width: 14,
                  height: 4,
                  borderRadius: 2,
                  background: step === n ? 'var(--ms-accent)' : 'rgba(255, 255, 255, 0.18)',
                }}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          ref={primaryRef}
          data-tour-primary
          onClick={isLast ? finish : goNext}
          style={{
            flexShrink: 0,
            background: 'var(--ms-accent-bg)',
            color: 'var(--ms-accent-soft)',
            border: '1px solid var(--ms-accent)',
            borderRadius: MODAL_RADIUS_CONTROL,
            padding: '5px 14px',
            cursor: 'pointer',
            fontSize: 12.5,
            fontWeight: 600,
            lineHeight: 1.4,
          }}
        >
          {primaryLabel}
        </button>
      </footer>
    </div>
  )
}