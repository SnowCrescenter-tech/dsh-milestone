/**
 * MilestoneOnboarding: the 0.6.4 first-run tutorial modal.
 *
 * Trigger/ownership lives in MilestoneRail (mount timer + settings reopen);
 * this component is a fully SELF-CONTAINED dialog: it carries the welcome
 * page, the 4 step pages with built-in toy demos, step progress, and the
 * close paths (skip / finish / Escape), and it persists the
 * `dsh-milestone.onboarded` flag itself via onboarding-store.
 *
 * Visual language is copied from the settings modal (MilestoneRail's
 * MODAL_CSS): dark `rgba(20, 24, 32, 0.98)` panel, three text tiers, 12px
 * panel / 8px control radii, one accent (inherited through the rail root's
 * `--ms-accent*` CSS variables), and a small ONBOARDING_CSS block for the
 * hover / :focus-visible / reduced-motion rules inline styles cannot express.
 *
 * Deliberate non-features:
 *   - NO outside-pointerdown dismissal (a misclick must never swallow the
 *     tutorial — the requirement explicitly keeps it off).
 *   - Escape ALWAYS means "skip": it persists the flag and closes.
 *   - The flag is written on IMPRESSION (the welcome page showing is enough);
 *     skip / finish / Escape re-assert it. A mid-tour refresh/crash never
 *     re-pops — replay lives in settings 重新查看教程.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import {
  MODAL_BG,
  MODAL_BORDER,
  MODAL_FG,
  MODAL_HINT,
  MODAL_RADIUS_CONTROL,
  MODAL_RADIUS_PANEL,
  MODAL_TEXT,
  MODAL_TITLE,
  MODAL_TIP_BG,
} from './modal-tokens'
import { writeOnboardedFlag } from './onboarding-store'
import { dotColor } from './rail-logic'
import { PLUGIN_NPM_URL, PLUGIN_REPO_URL, PLUGIN_VERSION } from './version-meta'
import type { MilestoneKey } from './locales.ts'

/** Step-page count — the progress indicator shape. */
const STEP_COUNT = [1, 2, 3, 4] as const
/** The onboarding modal floats above every other rail layer (settings 105). */
const ONBOARDING_Z = 110
/** Fake messages the step-1/step-2 demos run on (zh AND en keys exist). */
const DEMO_MESSAGE_KEYS: readonly MilestoneKey[] = [
  'onboarding.demo.m1',
  'onboarding.demo.m2',
  'onboarding.demo.m3',
  'onboarding.demo.m4',
  'onboarding.demo.m5',
]
/** Fake per-turn durations for the step-1 hover tooltip (unit text is locale-neutral). */
const DEMO_DURATIONS = ['6.2s', '13.4s', '5.1s', '22.0s', '9.8s'] as const

/**
 * Static onboarding-modal styling that needs `:hover`/`:focus-visible`
 * (inline styles cannot express them): one accent focus ring for every
 * control, hover washes, the demo-link micro-lift, the panel fade-in, and the
 * reduced-motion kill — mirrors the settings MODAL_CSS pattern. Accent values
 * come from the rail root's CSS variables (`--ms-accent*`), inherited into
 * this fixed layer because the overlay renders inside the rail root.
 */
const ONBOARDING_CSS = `
@keyframes ms-onboarding-fade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
[data-onboarding-panel] { animation: ms-onboarding-fade 160ms ease; }
[data-onboarding-skip]:hover { background: rgba(255, 255, 255, 0.08); }
[data-onboarding-prev]:hover, [data-onboarding-next]:hover, [data-onboarding-start]:hover, [data-onboarding-finish]:hover { background: rgba(255, 255, 255, 0.1); }
[data-onboarding-skip]:focus-visible, [data-onboarding-prev]:focus-visible,
[data-onboarding-next]:focus-visible, [data-onboarding-start]:focus-visible,
[data-onboarding-finish]:focus-visible, [data-demo-star]:focus-visible,
[data-demo-dot]:focus-visible, [data-demo-search-input]:focus-visible {
  box-shadow: 0 0 0 2px var(--ms-accent-soft);
}
[data-demo-link] { transition: transform 120ms ease, border-color 120ms ease, background 120ms ease; }
[data-demo-link]:hover { transform: translateY(-2px); border-color: var(--ms-accent); background: rgba(255, 255, 255, 0.09); }
@media (prefers-reduced-motion: reduce) {
  [data-onboarding-panel] { animation: none; }
  [data-onboarding-skip], [data-onboarding-prev], [data-onboarding-next],
  [data-onboarding-start], [data-onboarding-finish], [data-demo-link] { transition: none; }
}
`

/** Primary (accent) dialog action — start / next / finish. */
const PRIMARY_BUTTON: CSSProperties = {
  background: 'var(--ms-accent-bg)',
  color: 'var(--ms-accent-soft)',
  border: '1px solid var(--ms-accent)',
  borderRadius: MODAL_RADIUS_CONTROL,
  padding: '7px 18px',
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
/** Secondary dialog action — back / welcome skip. */
const GHOST_BUTTON: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.06)',
  color: MODAL_TEXT,
  border: `1px solid ${MODAL_BORDER}`,
  borderRadius: MODAL_RADIUS_CONTROL,
  padding: '7px 16px',
  fontSize: 12.5,
  cursor: 'pointer',
}
/** Corner skip (step pages) — the quietest of the three button tiers. */
const SKIP_BUTTON: CSSProperties = {
  background: 'transparent',
  color: MODAL_HINT,
  border: 'none',
  padding: '4px 8px',
  borderRadius: MODAL_RADIUS_CONTROL,
  fontSize: 12,
  cursor: 'pointer',
}

export interface MilestoneOnboardingProps {
  readonly t: TranslateNS<'dsh-milestone'>
  /** Current rail accent (settings 强调色) — drives the demo dots' gradients. */
  readonly accent: string
  /** Parent closes the modal (the flag is persisted HERE on every close path). */
  readonly onClose: () => void
}

/** Resolve the five fake demo messages through the active locale. */
function demoMessages(t: TranslateNS<'dsh-milestone'>): string[] {
  return DEMO_MESSAGE_KEYS.map((key) => t(key))
}

/**
 * Step-1 demo: a toy dot rail with the REAL dot visual — accent gradient dots,
 * hover enlarges + shows a fake metadata tooltip (position + duration), click
 * marks the dot with the white ring. All local state; nothing touches real
 * session data.
 */
function DemoDotRail({ t, accent }: { readonly t: TranslateNS<'dsh-milestone'>; readonly accent: string }) {
  const messages = demoMessages(t)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  return (
    <div data-demo-dots>
      <div data-demo-dot-row style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        {messages.map((msg, i) => {
          const hovered = hoverIndex === i
          const active = activeIndex === i
          return (
            <button
              key={msg}
              type="button"
              data-demo-dot={i}
              data-active={active ? 'true' : undefined}
              aria-label={msg}
              aria-pressed={active}
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onFocus={() => setHoverIndex(i)}
              onBlur={() => setHoverIndex(null)}
              onClick={() => setActiveIndex(i)}
              style={{
                width: 36,
                height: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                borderRadius: '50%',
              }}
            >
              <span
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: '50%',
                  background: dotColor(i, messages.length, accent),
                  boxShadow: active
                    ? '0 0 0 3px rgba(255, 255, 255, 0.9)'
                    : hovered
                      ? '0 0 0 3px rgba(255, 255, 255, 0.35)'
                      : 'none',
                  transform: hovered || active ? 'scale(1.35)' : 'scale(1)',
                  transition: 'transform 120ms ease, box-shadow 120ms ease',
                }}
              />
            </button>
          )
        })}
      </div>
      {hoverIndex !== null && (
        <div
          data-demo-tooltip
          style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: MODAL_TEXT, lineHeight: 1.5 }}
        >
          <span>{t('pos.of', { n: hoverIndex + 1, m: messages.length })}</span>
          <span> · </span>
          <span>{t('duration.label', { name: DEMO_DURATIONS[hoverIndex] })}</span>
        </div>
      )}
      <div data-demo-hint style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: MODAL_HINT }}>
        {t('onboarding.demo.hoverHint')}
      </div>
    </div>
  )
}

/**
 * Step-2 demo: a toy search box that filters the demo messages (N / M count)
 * plus one bookmark star — active = solid star + "bookmarks only" row list.
 * Local state only; the real rail/search/bookmarks are untouched.
 */
function DemoSearch({ t, accent }: { readonly t: TranslateNS<'dsh-milestone'>; readonly accent: string }) {
  const messages = demoMessages(t)
  // The demo's pre-bookmarked message ("解释这个报错" / "Explain this error").
  const starIndex = 1
  const [query, setQuery] = useState('')
  const [favOnly, setFavOnly] = useState(false)
  const lower = query.trim().toLowerCase()
  const visible = favOnly ? messages.filter((_, i) => i === starIndex) : messages
  const matches = lower === '' ? visible.length : visible.filter((m) => m.toLowerCase().includes(lower)).length
  return (
    <div data-demo-search>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          data-demo-search-input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '6px 10px',
            borderRadius: MODAL_RADIUS_CONTROL,
            border: `1px solid ${MODAL_BORDER}`,
            background: 'rgba(255, 255, 255, 0.05)',
            color: MODAL_FG,
            fontSize: 12.5,
            outline: 'none',
          }}
        />
        <span data-demo-search-count style={{ fontSize: 12, color: MODAL_TEXT, whiteSpace: 'nowrap' }}>
          {matches} / {visible.length}
        </span>
        <button
          type="button"
          data-demo-star
          aria-pressed={favOnly}
          aria-label={t('bookmark.filter')}
          title={t('bookmark.filter')}
          onClick={() => setFavOnly((v) => !v)}
          style={{
            width: 30,
            height: 30,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: favOnly ? 'var(--ms-accent-bg)' : 'transparent',
            border: `1px solid ${MODAL_BORDER}`,
            borderRadius: MODAL_RADIUS_CONTROL,
            padding: 0,
            cursor: 'pointer',
            color: favOnly ? 'var(--ms-accent-soft)' : MODAL_HINT,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill={favOnly ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      </div>
      <div data-demo-search-rows style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {visible.map((msg, i) => {
          const realIndex = favOnly ? starIndex : i
          const lit = lower === '' || msg.toLowerCase().includes(lower)
          return (
            <div
              key={msg}
              data-demo-search-row
              data-index={realIndex}
              data-lit={lit ? 'true' : 'false'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: lit ? MODAL_FG : MODAL_HINT,
                opacity: lit ? 1 : 0.45,
                transition: 'opacity 120ms ease',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 8,
                  height: 8,
                  flexShrink: 0,
                  borderRadius: '50%',
                  background: dotColor(realIndex, messages.length, accent),
                }}
              />
              <span>{msg}</span>
            </div>
          )
        })}
      </div>
      <div data-demo-search-hint style={{ marginTop: 8, textAlign: 'center', fontSize: 12, color: MODAL_HINT }}>
        {t('onboarding.demo.searchHint')}
      </div>
    </div>
  )
}

/**
 * Step-3 demo: a static legend of the personalization controls (accent / size /
 * distance / side / language / focus mix / pin), each with a tiny aria-hidden
 * visual, plus the 展开箭头 → 齿轮 → 设置 path hint.
 */
function DemoSettings({ t, accent }: { readonly t: TranslateNS<'dsh-milestone'>; readonly accent: string }) {
  const rows: ReadonlyArray<{ label: string; visual: ReactNode }> = [
    {
      label: t('settings.accent'),
      visual: <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: accent }} />,
    },
    {
      label: t('settings.iconSize'),
      visual: (
        <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: MODAL_HINT }} />
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: MODAL_TEXT }} />
        </span>
      ),
    },
    {
      label: t('settings.inset'),
      visual: (
        <span aria-hidden="true" style={{ width: 12, height: 12, border: `1px solid ${MODAL_BORDER}`, borderRadius: 2 }} />
      ),
    },
    {
      label: t('settings.side'),
      visual: <span aria-hidden="true" style={{ fontSize: 14, color: MODAL_TEXT }}>⇄</span>,
    },
    {
      label: t('settings.language'),
      visual: <span aria-hidden="true" style={{ fontSize: 11, color: MODAL_TEXT }}>中 / EN</span>,
    },
    {
      label: t('onboarding.demo.focusMix'),
      visual: (
        <svg aria-hidden="true" width="14" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
    },
    {
      label: t('onboarding.demo.pin'),
      visual: (
        <svg aria-hidden="true" width="12" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21v-4" />
          <path d="M7 4h10l-1.2 6.5a4.6 4.6 0 0 1-7.6 0z" />
        </svg>
      ),
    },
  ]
  return (
    <div data-demo-settings>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {rows.map((row) => (
          <div
            key={row.label}
            data-demo-legend-row
            style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: MODAL_TEXT }}
          >
            <span style={{ width: 56, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>{row.visual}</span>
            <span>{row.label}</span>
          </div>
        ))}
      </div>
      <div
        data-demo-settings-path
        style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: MODAL_HINT }}
      >
        {t('onboarding.demo.settingsPath')}
      </div>
    </div>
  )
}

/** Step-4 demo: update-check pill + the four support links (repo/star/issues/npm). */
function DemoSupport({ t }: { readonly t: TranslateNS<'dsh-milestone'> }) {
  const linkStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '7px 6px',
    borderRadius: MODAL_RADIUS_CONTROL,
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${MODAL_BORDER}`,
    color: MODAL_TITLE,
    fontSize: 11.5,
    textDecoration: 'none',
    textAlign: 'center',
    lineHeight: 1.35,
  }
  return (
    <div data-demo-support>
      <div
        data-demo-update-pill
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          borderRadius: 999,
          background: 'rgba(255, 255, 255, 0.06)',
          border: `1px solid ${MODAL_BORDER}`,
          color: MODAL_TEXT,
          fontSize: 12,
        }}
      >
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ms-accent)' }} />
        <span>
          {t('update.title')} · v{PLUGIN_VERSION}
        </span>
      </div>
      <div data-demo-links style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 12 }}>
        <a href={PLUGIN_REPO_URL} target="_blank" rel="noreferrer" data-demo-link data-link="repo" style={linkStyle}>
          {t('settings.repo')}
        </a>
        <a href={PLUGIN_REPO_URL} target="_blank" rel="noreferrer" data-demo-link data-link="star" style={linkStyle}>
          {t('settings.star')}
        </a>
        <a href={`${PLUGIN_REPO_URL}/issues`} target="_blank" rel="noreferrer" data-demo-link data-link="issues" style={linkStyle}>
          {t('settings.issues')}
        </a>
        <a href={PLUGIN_NPM_URL} target="_blank" rel="noreferrer" data-demo-link data-link="npm" style={linkStyle}>
          {t('settings.npm')}
        </a>
      </div>
    </div>
  )
}

/**
 * The tutorial dialog. `step` 0 = welcome; 1–4 = the step pages.
 *
 * Impressions persist: the moment the dialog mounts (welcome shown), the
 * onboarded flag is written — closing mid-tour via refresh/crash/navigation
 * never re-pops (ROADMAP 0.6.4: 印象即持久化). Every explicit close path
 * (skip anywhere, finish, Escape) re-asserts the same `'1'` and then lets the
 * parent unmount the modal.
 */
export function MilestoneOnboarding({ t, accent, onClose }: MilestoneOnboardingProps) {
  const [step, setStep] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // 印象即持久化: merely SHOWING the tutorial marks it seen. Runs on mount,
  // before any interaction — a user who closes the page mid-tour (or crashes)
  // will not see the tutorial again; replay lives in settings 重新查看教程.
  useEffect(() => {
    writeOnboardedFlag()
  }, [])

  /** Skip / finish / Escape converge here: persist, then close. */
  const finish = useCallback((): void => {
    writeOnboardedFlag()
    onClose()
  }, [onClose])

  // Escape === skip: persist + close. Never an outside-click dismissal (a
  // misclick must not swallow the tutorial).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [finish])

  // On open and on every page change, hand focus to the page's primary action.
  useEffect(() => {
    panelRef.current
      ?.querySelector<HTMLElement>('[data-onboarding-start], [data-onboarding-next], [data-onboarding-finish]')
      ?.focus()
  }, [step])

  const goNext = (): void => setStep((s) => Math.min(4, s + 1))
  const goPrev = (): void => setStep((s) => Math.max(1, s - 1))

  return (
    <div
      data-onboarding-overlay
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(8, 10, 15, 0.55)',
        zIndex: ONBOARDING_Z,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={panelRef}
        data-onboarding-panel
        role="dialog"
        aria-modal="true"
        aria-label={t('onboarding.welcome.title')}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 92vw)',
          maxHeight: '80vh',
          overflowY: 'auto',
          padding: 20,
          background: MODAL_BG,
          color: MODAL_FG,
          borderRadius: MODAL_RADIUS_PANEL,
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55)',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent',
        }}
      >
        <style>{ONBOARDING_CSS}</style>

        {step === 0 ? (
          <div data-onboarding-welcome>
            <div data-onboarding-welcome-title style={{ fontSize: 17, fontWeight: 700, color: MODAL_FG }}>
              {t('onboarding.welcome.title')}
            </div>
            <div
              data-onboarding-welcome-subtitle
              style={{ marginTop: 8, fontSize: 13, lineHeight: 1.65, color: MODAL_TEXT }}
            >
              {t('onboarding.welcome.subtitle')}
            </div>
            <div data-onboarding-welcome-actions style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 18 }}>
              <button type="button" data-onboarding-start onClick={() => setStep(1)} style={PRIMARY_BUTTON}>
                {t('onboarding.start')}
              </button>
              <button type="button" data-onboarding-skip onClick={finish} style={GHOST_BUTTON}>
                {t('onboarding.skip')}
              </button>
            </div>
          </div>
        ) : (
          <div data-onboarding-step data-step={step}>
            {/* Step header: title left, corner skip right. */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div data-onboarding-step-title style={{ fontSize: 15, fontWeight: 600, color: MODAL_FG }}>
                {step === 1 && t('onboarding.step1.title')}
                {step === 2 && t('onboarding.step2.title')}
                {step === 3 && t('onboarding.step3.title')}
                {step === 4 && t('onboarding.step4.title')}
              </div>
              <button type="button" data-onboarding-skip onClick={finish} style={SKIP_BUTTON}>
                {t('onboarding.skip')}
              </button>
            </div>

            {/* 2–3 lines of explanation per step. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {step === 1 && (
                <>
                  <div data-onboarding-step-desc data-desc="1">{t('onboarding.step1.desc1')}</div>
                  <div data-onboarding-step-desc data-desc="2">{t('onboarding.step1.desc2')}</div>
                  <div data-onboarding-step-desc data-desc="3">{t('onboarding.step1.desc3')}</div>
                </>
              )}
              {step === 2 && (
                <>
                  <div data-onboarding-step-desc data-desc="1">{t('onboarding.step2.desc1')}</div>
                  <div data-onboarding-step-desc data-desc="2">{t('onboarding.step2.desc2')}</div>
                </>
              )}
              {step === 3 && (
                <>
                  <div data-onboarding-step-desc data-desc="1">{t('onboarding.step3.desc1')}</div>
                  <div data-onboarding-step-desc data-desc="2">{t('onboarding.step3.desc2')}</div>
                </>
              )}
              {step === 4 && (
                <>
                  <div data-onboarding-step-desc data-desc="1">{t('onboarding.step4.desc1')}</div>
                  <div data-onboarding-step-desc data-desc="2">{t('onboarding.step4.desc2')}</div>
                </>
              )}
            </div>

            {/* Built-in demo area — fully self-contained, no real session data. */}
            <div
              data-onboarding-demo
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: MODAL_RADIUS_CONTROL,
                background: MODAL_TIP_BG,
                border: `1px solid ${MODAL_BORDER}`,
              }}
            >
              {step === 1 && <DemoDotRail t={t} accent={accent} />}
              {step === 2 && <DemoSearch t={t} accent={accent} />}
              {step === 3 && <DemoSettings t={t} accent={accent} />}
              {step === 4 && <DemoSupport t={t} />}
            </div>

            {/* Footer: back · step progress · next (末步 = 开始使用). */}
            <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 16 }}>
              <button type="button" data-onboarding-prev onClick={goPrev} disabled={step === 1} style={GHOST_BUTTON}>
                {t('onboarding.prev')}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div data-onboarding-progress style={{ fontSize: 12, color: MODAL_HINT }}>
                  {t('onboarding.step.label', { n: step })}
                </div>
                <div style={{ display: 'flex', gap: 5 }}>
                  {STEP_COUNT.map((n) => (
                    <span
                      key={n}
                      data-onboarding-progress-dot
                      data-active={step === n ? 'true' : undefined}
                      aria-label={t('onboarding.step.short', { n })}
                      aria-current={step === n ? 'step' : undefined}
                      style={{
                        width: 16,
                        height: 4,
                        borderRadius: 2,
                        background: step === n ? 'var(--ms-accent)' : 'rgba(255, 255, 255, 0.18)',
                        transition: 'background 120ms ease, width 120ms ease',
                      }}
                    />
                  ))}
                </div>
              </div>
              {step < 4 ? (
                <button type="button" data-onboarding-next onClick={goNext} style={PRIMARY_BUTTON}>
                  {t('onboarding.next')}
                </button>
              ) : (
                <button type="button" data-onboarding-finish onClick={finish} style={PRIMARY_BUTTON}>
                  {t('onboarding.finish')}
                </button>
              )}
            </footer>
          </div>
        )}
      </div>
    </div>
  )
}