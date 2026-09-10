/**
 * Component tests for GitHub issue #4 — the collapsed rail's floating ball.
 *
 * When the rail is collapsed (`[data-rail-collapse]`), ONLY the floating ball
 * (`[data-milestone-ball]`) renders: a click expands the rail again, a drag
 * (ballMode 'draggable') moves it and persists the clamped position, and the
 * settings modal's floating-ball section picks fixed vs draggable + resets the
 * stored position. `railCollapsed` itself is EPHEMERAL — never persisted.
 *
 * The suite drives the REAL render helper (../test/renderRail.tsx) with its
 * additive `prefs` seed, so the rail's `useState(loadPrefs)` initializer
 * hydrates `ballMode`/`ball` from localStorage before mount, exactly like a
 * reload would.
 *
 * DOM contract pinned here:
 *   - `[data-rail-collapse]`        rail-top collapse control (aria-label).
 *   - `[data-milestone-ball]`       the collapsed floating ball (role=button,
 *                                   data-ball-x / data-ball-y mirror the pos).
 *   - `[data-ball-toggle]`          settings collapsible header (aria-expanded).
 *   - `[data-ball-mode-radio]`      fixed/draggable radios (name ms-ball-mode).
 *   - `[data-ball-reset]`           clears the persisted ball position.
 *   - `[data-settings-ball-hint]`   the section hint inside the expanded block.
 *
 * jsdom 30 implements PointerEvent but NOT Element.setPointerCapture, so the
 * implementation guards the capture calls (and these tests never rely on
 * capture to drive the gesture — the window-level listeners do).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent } from '@testing-library/react'
import { BALL_SIZE } from './ball-position'
import { TOOLBAR_PREFS_KEY } from './toolbar-prefs.ts'
import { renderRail, type RailUser } from '../test/renderRail.tsx'

const USERS: RailUser[] = [
  { key: '13:user<ball-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<ball-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  // The resize test shrinks the jsdom viewport; restore the default so later
  // suites in the same worker never inherit it.
  window.innerWidth = 1024
  window.innerHeight = 768
})

/** Query one element, failing loudly (no non-null assertions in this suite). */
function requireEl(selector: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(selector)
  if (el === null) throw new Error(`${selector} not found`)
  return el
}

/** Query one input element, failing loudly. */
function requireInput(selector: string): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>(selector)
  if (el === null) throw new Error(`${selector} not found`)
  return el
}

/** The collapsed floating ball. */
function ballEl(): HTMLElement {
  return requireEl('[data-milestone-ball]')
}

/** Every rendered dot button. */
function dots(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-rail-dot]')]
}

/** The ball's mirrored coordinates. */
function ballXY(el: HTMLElement): { x: number; y: number } {
  return {
    x: Number(el.getAttribute('data-ball-x')),
    y: Number(el.getAttribute('data-ball-y')),
  }
}

/** Last stored toolbar blob, parsed. */
function storedPrefs(backing: Map<string, string>): Record<string, unknown> {
  const raw = backing.get(TOOLBAR_PREFS_KEY)
  if (raw === undefined) throw new Error('toolbar prefs were never persisted')
  return JSON.parse(raw) as Record<string, unknown>
}

/** Collapse the rail through its new chrome control (the ball must appear). */
function collapseToBall(): HTMLElement {
  fireEvent.click(requireEl('[data-rail-collapse]'))
  return ballEl()
}

/** Expand the folded toolbar and open the settings modal (house pattern). */
function openSettings(): void {
  const expand = requireEl('[data-toolbar-expand]')
  if (expand.getAttribute('aria-expanded') !== 'true') fireEvent.click(expand)
  if (document.querySelector('[data-toolbar-settings-panel]') === null) {
    fireEvent.click(requireEl('[data-toolbar-settings]'))
  }
}

/** Expand the collapsed-by-default floating-ball settings block. */
function expandBallSettings(): void {
  const toggle = requireEl('[data-ball-toggle]')
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
}

describe('MilestoneRail floating ball (issue #4)', () => {
  it('the rail shows a collapse control; collapsing swaps the dots for the ball', () => {
    renderRail(USERS)

    expect(dots().length).toBeGreaterThan(0)
    expect(document.querySelector('[data-milestone-ball]')).toBeNull()

    const collapse = requireEl('[data-rail-collapse]')
    expect(collapse.getAttribute('aria-label')).toBe('收起为悬浮球')
    expect(collapse.getAttribute('title')).toBe('收起为悬浮球')

    fireEvent.click(collapse)

    // Rail + dots + toolbar are gone; only the floating ball remains.
    expect(document.querySelectorAll('[data-rail-dot]')).toHaveLength(0)
    expect(document.querySelector('[data-rail-list]')).toBeNull()
    expect(document.querySelector('[data-toolbar-expand]')).toBeNull()

    const ball = ballEl()
    expect(ball.getAttribute('role')).toBe('button')
    expect(ball.getAttribute('aria-label')).toBe('展开里程碑条')
    expect(ball.getAttribute('title')).toBe('展开里程碑条')
    expect(ball.tabIndex).toBe(0)
    expect(ball.style.position).toBe('fixed')
    expect(ball.style.width).toBe(`${BALL_SIZE}px`)
    expect(ball.style.height).toBe(`${BALL_SIZE}px`)
    expect(ball.style.borderRadius).toBe('50%')
    expect(ball.style.opacity).toBe('0.9')
    expect(ball.style.cursor).toBe('grab')
    // The mirrored coordinates are finite ints inside the viewport.
    const pos = ballXY(ball)
    expect(Number.isInteger(pos.x)).toBe(true)
    expect(Number.isInteger(pos.y)).toBe(true)
  })

  it('clicking the ball with no movement expands the rail again', () => {
    renderRail(USERS)
    const ball = collapseToBall()

    fireEvent.pointerDown(ball, { pointerId: 1, clientX: 500, clientY: 300 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 500, clientY: 300 })

    expect(document.querySelector('[data-milestone-ball]')).toBeNull()
    expect(dots().length).toBeGreaterThan(0)
  })

  it('dragging moves the ball past the threshold and persists the position without expanding', () => {
    const { backing } = renderRail(USERS)
    const ball = collapseToBall()
    const before = ballXY(ball)

    fireEvent.pointerDown(ball, { pointerId: 1, clientX: 500, clientY: 300 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 300, clientY: 150 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 100 })
    // Live drag position: start + pointer delta, no snap-back while pressed.
    expect(ballXY(ballEl())).toEqual({ x: before.x - 300, y: before.y - 200 })

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 200, clientY: 100 })

    // A drag is NOT a click: the rail stays collapsed with the ball visible.
    expect(document.querySelector('[data-milestone-ball]')).not.toBeNull()
    expect(document.querySelectorAll('[data-rail-dot]')).toHaveLength(0)

    // Persisted: the final clamped position as finite {x, y}.
    const pos = storedPrefs(backing).ball as { x: number; y: number }
    expect(Number.isFinite(pos.x)).toBe(true)
    expect(Number.isFinite(pos.y)).toBe(true)
    expect(pos).toEqual({ x: before.x - 300, y: before.y - 200 })

    // The resting spot after release is the persisted one.
    expect(ballXY(ballEl())).toEqual({ x: before.x - 300, y: before.y - 200 })
  })

  it('ballMode=fixed: a drag gesture never moves or persists the ball, but a click still expands', () => {
    const { backing } = renderRail(USERS, { prefs: { ballMode: 'fixed' } })
    const ball = collapseToBall()
    expect(ball.style.cursor).toBe('pointer')
    const before = ballXY(ball)
    const blobBefore = backing.get(TOOLBAR_PREFS_KEY)

    fireEvent.pointerDown(ball, { pointerId: 1, clientX: 500, clientY: 300 })
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 100 })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 200, clientY: 100 })

    // No drag listeners were armed: position and storage are untouched.
    expect(ballXY(ballEl())).toEqual(before)
    expect(backing.get(TOOLBAR_PREFS_KEY)).toBe(blobBefore)

    // The plain click path still expands the rail.
    fireEvent.click(ballEl())
    expect(document.querySelector('[data-milestone-ball]')).toBeNull()
    expect(dots().length).toBeGreaterThan(0)
  })

  it('settings: the floating-ball section reveals the mode radios and persists fixed/draggable', () => {
    const { backing } = renderRail(USERS)
    openSettings()

    const toggle = requireEl('[data-ball-toggle]')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // Collapsed by default: no radios yet; the header leads with the mode.
    expect(document.querySelector('[data-ball-mode-radio]')).toBeNull()
    expect(requireEl('[data-ball-summary]').textContent).toBe('可拖动')

    expandBallSettings()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('[role="radiogroup"][aria-label="行为"]')).not.toBeNull()
    expect(requireEl('[data-settings-ball-hint]').textContent).toContain('悬浮球')

    const fixed = requireInput('[data-ball-mode-radio][value="fixed"]')
    const draggable = requireInput('[data-ball-mode-radio][value="draggable"]')
    expect(draggable.checked).toBe(true)
    expect(fixed.checked).toBe(false)

    fireEvent.click(fixed)
    expect(fixed.checked).toBe(true)
    expect(storedPrefs(backing).ballMode).toBe('fixed')
    expect(requireEl('[data-ball-summary]').textContent).toBe('固定')

    fireEvent.click(draggable)
    expect(draggable.checked).toBe(true)
    expect(storedPrefs(backing).ballMode).toBe('draggable')
    expect(requireEl('[data-ball-summary]').textContent).toBe('可拖动')
  })

  it('data-ball-reset drops a seeded ball position back to null in the persisted blob', () => {
    const { backing } = renderRail(USERS, {
      prefs: { ball: { x: 123, y: 234 }, ballMode: 'draggable' },
    })
    openSettings()
    expandBallSettings()

    const reset = requireEl('[data-ball-reset]')
    expect(reset.textContent).toBe('重置位置')
    fireEvent.click(reset)

    const stored = storedPrefs(backing)
    expect(stored.ball).toBeNull()
    // Unrelated prefs survive the reset.
    expect(stored.ballMode).toBe('draggable')
  })

  it('a resize while collapsed re-clamps the ball inside the live viewport', () => {
    window.innerWidth = 2000
    window.innerHeight = 1200
    renderRail(USERS, { prefs: { ball: { x: 1900, y: 1100 }, ballMode: 'draggable' } })
    const ball = collapseToBall()
    const before = ballXY(ball)
    // The seeded spot fits the LARGE viewport (clamped to its margins).
    expect(before.x).toBeLessThanOrEqual(2000 - BALL_SIZE)
    expect(before.y).toBeLessThanOrEqual(1200 - BALL_SIZE)

    // Shrink the viewport: the ball must re-clamp against the live size.
    window.innerWidth = 320
    window.innerHeight = 240
    fireEvent(window, new Event('resize'))

    const after = ballXY(ballEl())
    expect(after.x).toBeGreaterThanOrEqual(0)
    expect(after.x).toBeLessThanOrEqual(320 - BALL_SIZE)
    expect(after.y).toBeGreaterThanOrEqual(0)
    expect(after.y).toBeLessThanOrEqual(240 - BALL_SIZE)
    // A resize never expands the rail.
    expect(document.querySelectorAll('[data-rail-dot]')).toHaveLength(0)
  })
})
