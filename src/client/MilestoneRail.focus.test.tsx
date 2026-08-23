/**
 * RED component tests for the milestone rail's focus mode (P3 + 0.6.3): a
 * rail-top toggle that dims the harness's AI thinking/scratchpad blocks
 * (`[data-variant="think"]`) so the conversation reads cleaner. Since 0.6.3
 * the exact rules are composed from the PERSISTED focus mix (buildFocusCss
 * over `prefs.focus`): which content dims/collapses and at what strength is
 * user-tuned in settings; the eye button stays the master switch.
 *
 * Contract asserted:
 *   - a rail-top toggle button `[data-focus-toggle]` renders with
 *     `aria-pressed="false"` and the `focus.on` label initially
 *   - clicking it flips `data-focus-active` on the RAIL ROOT (the flex
 *     column with `aria-label` = rail.label) from undefined → 'true' → back,
 *     and the button's aria-pressed follows
 *   - while focus is active the component emits an inline <style> whose text
 *     is composed from the focus mix: the default `[data-variant="think"]`
 *     dim rule, and (with the tools option) the `[data-chat-call-id]` tool
 *     card rule; when inactive no such style exists
 *   - `buildFocusCss` is pure and pinned by direct unit assertions
 *   - focus toggling never disturbs the existing search/bookmark toggles
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent } from '@testing-library/react'
import { renderRail } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'
import { buildFocusCss } from './MilestoneRail.tsx'
import { DEFAULT_FOCUS_PREFS } from './toolbar-prefs.ts'

const USERS: RailUser[] = [
  { key: '13:user<focus-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<focus-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** B1: the toolbar defaults COLLAPSED — expand it to reveal the focus toggle. */
function expandToolbar() {
  const btn = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (btn === null) throw new Error('data-toolbar-expand not found')
  fireEvent.click(btn)
}

/** The rail-top focus-mode toggle button. */
function focusToggle(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-focus-toggle]')
  if (el === null) throw new Error('data-focus-toggle not found')
  return el
}

/** Follow the real path into the settings modal (expand → gear). */
function openSettings() {
  const expand = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (expand === null) throw new Error('data-toolbar-expand not found')
  if (expand.getAttribute('aria-expanded') !== 'true') fireEvent.click(expand)
  const gear = document.querySelector<HTMLElement>('[data-toolbar-settings]')
  if (gear === null) throw new Error('data-toolbar-settings not found')
  if (document.querySelector('[data-toolbar-settings-panel]') === null) fireEvent.click(gear)
}

/** Expand the collapsed-by-default focus settings block (0.6.3). */
function expandFocusBlock() {
  const toggle = document.querySelector<HTMLElement>('[data-focus-toggle-settings]')
  if (toggle === null) throw new Error('data-focus-toggle-settings not found')
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
}

/** The rail root: the outer flex column (identified by rail.label's zh copy). */
function railRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>('div[aria-label="会话里程碑"]')
  if (el === null) throw new Error('rail root not found')
  return el
}

/** Text of any <style> whose content contains `fragment`, or null. */
function styleContaining(fragment: string): string | null {
  for (const style of document.querySelectorAll('style')) {
    if (style.textContent?.includes(fragment)) return style.textContent
  }
  return null
}

describe('MilestoneRail focus mode (P3)', () => {
  it('renders a focus toggle button with aria-pressed false and the focus.on label', () => {
    renderRail(USERS)
    expandToolbar()

    const toggle = focusToggle()
    expect(toggle).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('aria-label', '聚焦模式')
  })

  it('clicking the toggle flips data-focus-active on the rail root and aria-pressed', () => {
    renderRail(USERS)
    expandToolbar()
    const toggle = focusToggle()
    const root = railRoot()

    expect(root).not.toHaveAttribute('data-focus-active')

    fireEvent.click(toggle)
    expect(root).toHaveAttribute('data-focus-active', 'true')
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute('aria-label', '退出聚焦')

    fireEvent.click(toggle)
    expect(root).not.toHaveAttribute('data-focus-active')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveAttribute('aria-label', '聚焦模式')
  })

  it('emits the think-block dim style only while focus is active', () => {
    renderRail(USERS)
    expandToolbar()

    expect(styleContaining('[data-variant="think"]')).toBeNull()

    fireEvent.click(focusToggle())
    const css = styleContaining('[data-variant="think"]')
    expect(css).not.toBeNull()
    expect(css).toContain('opacity: 0.4')

    fireEvent.click(focusToggle())
    expect(styleContaining('[data-variant="think"]')).toBeNull()
  })

  it('focus toggling leaves the search and bookmark toggles intact', () => {
    renderRail(USERS)
    expandToolbar()

    fireEvent.click(focusToggle())

    const searchToggle = document.querySelector('[data-search-toggle]')
    expect(searchToggle).not.toBeNull()
    expect(searchToggle).toHaveAttribute('aria-pressed', 'false')

    const bookmarkToggle = document.querySelector('[data-bookmarks-toggle]')
    expect(bookmarkToggle).not.toBeNull()
    expect(bookmarkToggle).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('MilestoneRail focus mode — prefs-driven CSS (0.6.3)', () => {
  it('buildFocusCss composes the rules purely from the focus mix', () => {
    const def = DEFAULT_FOCUS_PREFS
    // Classic default: dim think at 40%, hover/open restore — byte-compatible
    // with the pre-0.6.3 static rule.
    expect(buildFocusCss(def)).toBe(
      '[data-variant="think"] { opacity: 0.4; transition: opacity 0.2s; }\n' +
        '[data-variant="think"]:hover, [data-variant="think"] [data-open] { opacity: 1; }',
    )
    // The tools option emits the stable [data-chat-call-id] card rule.
    const tools = buildFocusCss({ ...def, dimTools: true })
    expect(tools).toContain('[data-chat-call-id] { opacity: 0.4; transition: opacity 0.2s; }')
    expect(tools).toContain('[data-chat-call-id]:hover, [data-chat-call-id] [data-open] { opacity: 1; }')
    // The collapse option emits the pure-CSS hover strip (max-height clamp).
    const collapse = buildFocusCss({ ...def, collapseThink: true })
    expect(collapse).toContain('max-height: 36px; overflow: hidden')
    expect(collapse).toContain('max-height: 78vh;')
    // The strength feeds every dim rule, formatted exactly (no float residue).
    const strong = buildFocusCss({ ...def, dimTools: true, opacity: 0.3 })
    expect(strong).toContain('opacity: 0.3')
    expect(strong).not.toContain('0.30000000000000004')
    // Nothing armed → no rules at all (the master switch injects nothing).
    expect(buildFocusCss({ ...def, dimThink: false, dimTools: false, collapseThink: false })).toBe('')
  })

  it('the injected style follows the persisted focus mix (custom recipe)', () => {
    renderRail(USERS)
    expandToolbar()
    openSettings()
    expandFocusBlock()

    // Recipe: dim think (kept) + dim tools + collapse think, strength 30%.
    fireEvent.click(document.querySelector<HTMLInputElement>('[data-focus-dim-tools]')!)
    fireEvent.click(document.querySelector<HTMLInputElement>('[data-focus-collapse-think]')!)
    fireEvent.change(document.querySelector<HTMLInputElement>('input[data-focus-opacity]')!, {
      target: { value: '0.3' },
    })
    fireEvent.keyDown(window, { key: 'Escape' })

    // Not armed yet — the customized recipe is not injected.
    expect(styleContaining('[data-variant="think"]')).toBeNull()
    expect(styleContaining('[data-chat-call-id]')).toBeNull()

    fireEvent.click(focusToggle())
    const think = styleContaining('[data-variant="think"]')
    expect(think).not.toBeNull()
    expect(think).toContain('opacity: 0.3')
    expect(think).toContain('max-height: 36px')
    const tools = styleContaining('[data-chat-call-id]')
    expect(tools).not.toBeNull()
    expect(tools).toContain('opacity: 0.3')
  })

  it('changing prefs while focus is ACTIVE updates the injected style text', () => {
    renderRail(USERS)
    expandToolbar()

    fireEvent.click(focusToggle())
    expect(styleContaining('[data-variant="think"]')).toContain('opacity: 0.4')

    openSettings()
    expandFocusBlock()
    fireEvent.change(document.querySelector<HTMLInputElement>('input[data-focus-opacity]')!, {
      target: { value: '0.6' },
    })

    const think = styleContaining('[data-variant="think"]')
    expect(think).toContain('opacity: 0.6')
    expect(think).not.toContain('opacity: 0.4')
  })

  it('the master switch off never injects rules, even with customized prefs', () => {
    renderRail(USERS)
    expandToolbar()
    openSettings()
    expandFocusBlock()

    fireEvent.click(document.querySelector<HTMLInputElement>('[data-focus-dim-tools]')!)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(styleContaining('[data-variant="think"]')).toBeNull()
    expect(styleContaining('[data-chat-call-id]')).toBeNull()
  })
})
