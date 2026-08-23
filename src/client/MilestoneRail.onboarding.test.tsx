/**
 * Component tests for the 0.6.5 first-run coach-bubble tour (MilestoneTour,
 * mounted by MilestoneRail):
 *   - mount trigger: ~800ms after the rail mounts, WITHOUT a persisted
 *     `dsh-milestone.onboarded` flag bubble 0 appears anchored to
 *     `data-rail-list`; WITH the flag it never appears
 *   - impression persistence: showing bubble 0 writes '1' immediately; a
 *     remount on the same storage never re-pops
 *   - REAL-interaction auto-advance: clicking data-toolbar-expand advances
 *     bubble 1 → 2 without 下一步; clicking data-toolbar-settings (the panel
 *     appearing) advances bubble 2 → 3; the bubble suspends while settings is
 *     open and resumes at the current step after it closes
 *   - the 下一步 fallback from bubble 1 force-expands the toolbar so the gear
 *     anchor always exists (steps ≥ 2)
 *   - skip / Escape / finish persist the flag and close
 *   - settings → 重新查看教程 (data-onboarding-reopen) restarts from bubble 0
 *     even with the flag already set — including when the tour was already
 *     open, suspended behind settings
 *   - the highlight ring rides ONE real target per step and moves on step
 *     change; an en dictionary flips the tour copy
 *
 * The render helper mirrors MilestoneRail.settings.test.tsx (renderRail.tsx is
 * owned by an earlier phase — untouched). Timers are faked per test so the
 * mount delay is driven deterministically (same pattern as the update tests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { en, zh } from './locales.ts'
import { ONBOARDED_KEY } from './onboarding-store'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'
import { buildSnapshot } from '../test/snapshot-fixture.ts'
import type { RailUser } from '../test/renderRail.tsx'

const USERS: RailUser[] = [
  { key: '13:user<ob-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<ob-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

/** The mount-time tunnel-show delay the rail uses (ms). */
const MOUNT_DELAY = 800

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

/** Same module-level dictionary interpreter as renderRail. */
function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    const tpl = dict[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot)) : tpl
  }
}

/** Full Storage surface over a Map (mirrors renderRail's helper). */
function createStorage(backing: Map<string, string>): Storage {
  return {
    get length() {
      return backing.size
    },
    clear: () => {
      backing.clear()
    },
    getItem: (k: string) => backing.get(k) ?? null,
    key: (index: number) => [...backing.keys()][index] ?? null,
    removeItem: (k: string) => {
      backing.delete(k)
    },
    setItem: (k: string, v: string) => {
      backing.set(k, v)
    },
  }
}

/**
 * Render the rail with an optional pre-seeded onboarded flag and dictionary.
 * `backing` lets a test REUSE one storage Map across renders (the refresh /
 * remount simulation shares the persisted flag between two mounts).
 */
function renderOnboardingRail(opts?: {
  onboarded?: boolean
  dict?: Record<string, string>
  backing?: Map<string, string>
}) {
  const snapshot = buildSnapshot({ users: USERS })
  const useSession = (selector: (snap: ConversationSnapshotFixture) => unknown) => selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const useProjection = () => undefined
  const t = makeT(opts?.dict ?? (zh as Record<string, string>))
  const forkAt = vi.fn(async () => 'child-id')

  const backing = opts?.backing ?? new Map<string, string>()
  if (opts?.backing === undefined && opts?.onboarded === true) backing.set(ONBOARDED_KEY, '1')
  vi.stubGlobal('localStorage', createStorage(backing))
  const store = createBookmarksStore().create('fixture')
  const useStore = (selector: (snap: { keys: string[] }) => unknown) => selector(store.getSnapshot())

  const props = {
    useSession,
    sessionId: 'fixture',
    useProjection,
    loadOlder,
    useStore,
    actions: store.actions,
    t,
    forkAt,
    searchSessions: async () => ({ items: [], hasMore: false }),
    openSession: () => {},
  } as unknown as MilestoneRailProps

  const result = render(
    <div data-conversation-scroll>
      <div style={{ height: 400 }}>
        {USERS.map((user) => (
          <div key={user.key} data-chat-anchor-key={user.key} style={{ height: 48 }}>
            {user.text}
          </div>
        ))}
      </div>
      <MilestoneRail {...props} />
    </div>,
  )

  return { ...result, backing }
}

/** Drive past the mount delay so the trigger fires (if it is going to). */
function openTour(): void {
  act(() => {
    vi.advanceTimersByTime(MOUNT_DELAY)
  })
}

/** Drive past the mount delay WITHOUT the tour popping when flagged. */
function advancePastDelay(): void {
  act(() => {
    vi.advanceTimersByTime(MOUNT_DELAY + 100)
  })
}

function bubble(): HTMLElement | null {
  return document.querySelector('[data-tour-bubble]')
}

function stepAttr(): string {
  const el = bubble()
  if (el === null) throw new Error('data-tour-bubble not found')
  return el.getAttribute('data-tour-step') ?? ''
}

function primaryBtn(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-tour-primary]')
  if (el === null) throw new Error('data-tour-primary not found')
  return el
}

function prevBtn(): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>('[data-tour-prev]')
  if (el === null) throw new Error('data-tour-prev not found')
  return el
}

function skipBtn(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-tour-skip]')
  if (el === null) throw new Error('data-tour-skip not found')
  return el
}

function progressText(): string | null {
  return document.querySelector('[data-tour-progress]')?.textContent ?? null
}

function progressDots(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-tour-progress-dot]')]
}

describe('MilestoneRail tour — trigger & flag (0.6.5)', () => {
  it('first mount without the flag shows bubble 0 anchored to data-rail-list ~800ms later', () => {
    const { backing } = renderOnboardingRail()
    expect(bubble()).toBeNull()

    openTour()

    expect(bubble()).not.toBeNull()
    expect(stepAttr()).toBe('0')
    expect(bubble()!.textContent).toContain('欢迎使用 dsh-milestone')
    // The bubble anchors the REAL dot list (no toy demos anywhere).
    expect(document.querySelector('[data-rail-list]')).toHaveAttribute('data-tour-highlight')
    // 显示即写 '1': merely showing bubble 0 already persists the impression.
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('the impression persists at once — display alone writes the flag; remount never re-pops', () => {
    const backing = new Map<string, string>()
    renderOnboardingRail({ backing })
    openTour()
    expect(bubble()).not.toBeNull()
    // 印象即持久化: no skip/finish/Escape yet — bubble 0 merely displayed,
    // and the marker is already '1' in storage.
    expect(backing.get(ONBOARDED_KEY)).toBe('1')

    // 直接卸载/关页模拟: tear the tree down without clicking anything.
    cleanup()

    // The same storage remounts (a fresh page load in the same browser):
    // the persisted marker must suppress the tour entirely.
    renderOnboardingRail({ backing })
    advancePastDelay()
    expect(bubble()).toBeNull()
  })

  it('a persisted flag suppresses the tour entirely', () => {
    renderOnboardingRail({ onboarded: true })

    advancePastDelay()

    expect(bubble()).toBeNull()
    expect(document.querySelector('[data-tour-highlight]')).toBeNull()
  })

  it('an en dictionary flips the tour copy', () => {
    renderOnboardingRail({ dict: en as Record<string, string> })
    openTour()

    expect(bubble()!.textContent).toContain('Welcome to dsh-milestone')
    fireEvent.click(primaryBtn())
    expect(stepAttr()).toBe('1')
    expect(bubble()!.textContent).toContain('Expand the toolbar')
    expect(document.querySelector('[data-toolbar-expand]')).toHaveAttribute('data-tour-highlight')
  })
})

describe('MilestoneRail tour — navigation, progress & persistence', () => {
  it('bubble 0 → five bubbles (prev/next/progress dots) → 开始使用 persists and closes', () => {
    const { backing } = renderOnboardingRail()
    openTour()

    // Bubble 0: no back, primary is 开始使用, progress reads 第 1 / 5 步.
    expect(stepAttr()).toBe('0')
    expect(progressText()).toBe('第 1 / 5 步')
    expect(prevBtn()).toBeDisabled()
    expect(primaryBtn().textContent).toBe('开始使用')
    // Focus lands on the bubble's primary action.
    expect(document.activeElement).toBe(primaryBtn())

    const dots = progressDots()
    expect(dots).toHaveLength(5)
    const active = dots.filter((d) => d.dataset.active === 'true')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAttribute('aria-current', 'step')
    expect(active[0].getAttribute('aria-label')).toBe('第 1 步')

    fireEvent.click(primaryBtn())
    expect(stepAttr()).toBe('1')
    expect(progressText()).toBe('第 2 / 5 步')
    expect(prevBtn()).not.toBeDisabled()
    expect(primaryBtn().textContent).toBe('下一步')

    // Back returns to bubble 0, then forward to the last bubble.
    fireEvent.click(prevBtn())
    expect(stepAttr()).toBe('0')
    expect(prevBtn()).toBeDisabled()
    fireEvent.click(primaryBtn()) // 1
    fireEvent.click(primaryBtn()) // 2
    fireEvent.click(primaryBtn()) // 3
    fireEvent.click(primaryBtn()) // 4
    expect(stepAttr()).toBe('4')
    expect(progressText()).toBe('第 5 / 5 步')
    expect(primaryBtn().textContent).toBe('开始使用')

    // The last bubble's primary is 开始使用 — persists + closes.
    fireEvent.click(primaryBtn())
    expect(bubble()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('skipping from a bubble persists and closes', () => {
    const { backing } = renderOnboardingRail()
    openTour()
    fireEvent.click(primaryBtn()) // 1
    fireEvent.click(primaryBtn()) // 2

    fireEvent.click(skipBtn())

    expect(bubble()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('skipping from bubble 0 persists and closes', () => {
    const { backing } = renderOnboardingRail()
    openTour()

    fireEvent.click(skipBtn())

    expect(bubble()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('Escape equals skip — persists and closes from any bubble', () => {
    const { backing } = renderOnboardingRail()
    openTour()
    fireEvent.click(primaryBtn()) // 1

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(bubble()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })
})

describe('MilestoneRail tour — real-interaction auto-advance & suspension', () => {
  it('bubble 1: clicking the REAL expand arrow auto-advances to bubble 2 (no 下一步)', () => {
    renderOnboardingRail()
    openTour()
    fireEvent.click(primaryBtn()) // → bubble 1
    expect(stepAttr()).toBe('1')
    expect(document.querySelector('[data-toolbar-expand]')).toHaveAttribute('data-tour-highlight')

    // The REAL click — not the fallback button — is what advances the tour.
    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-expand]')!)

    expect(stepAttr()).toBe('2')
    expect(document.querySelector('[data-toolbar-settings]')).toHaveAttribute('data-tour-highlight')
  })

  it('bubble 1 → 2 fallback: 下一步 force-expands the toolbar so the gear anchor exists', () => {
    renderOnboardingRail()
    openTour()
    fireEvent.click(primaryBtn()) // 1

    fireEvent.click(primaryBtn()) // 2 (fallback — toolbar still folded)

    expect(stepAttr()).toBe('2')
    const expand = document.querySelector<HTMLElement>('[data-toolbar-expand]')
    expect(expand).not.toBeNull()
    expect(expand!.getAttribute('aria-expanded')).toBe('true')
    // The gear now exists AND carries the highlight (entering step ≥ 2
    // guarantees the anchor is rendered).
    expect(document.querySelector('[data-toolbar-settings]')).toHaveAttribute('data-tour-highlight')
  })

  it('bubble 2: opening the REAL settings panel auto-advances; the bubble suspends and resumes', () => {
    const { backing } = renderOnboardingRail()
    openTour()
    fireEvent.click(primaryBtn()) // 1
    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-expand]')!) // real expand → 2
    expect(stepAttr()).toBe('2')
    expect(document.querySelector('[data-toolbar-settings]')).toHaveAttribute('data-tour-highlight')

    // The REAL gear click opens the panel — that IS the auto-advance trigger.
    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-settings]')!)
    expect(document.querySelector('[data-toolbar-settings-panel]')).not.toBeNull()
    // Suspended while the settings modal is open (state kept, nothing shown).
    expect(bubble()).toBeNull()

    // Closing settings resumes the bubble at the CURRENT step (bubble 3 = dots).
    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-settings-close]')!)
    expect(document.querySelector('[data-toolbar-settings-panel]')).toBeNull()
    expect(bubble()).not.toBeNull()
    expect(stepAttr()).toBe('3')
    expect(document.querySelector('[data-rail-dot]')).toHaveAttribute('data-tour-highlight')
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('Escape while settings is open closes settings — never the tour', () => {
    renderOnboardingRail()
    openTour()
    fireEvent.click(primaryBtn()) // 1
    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-expand]')!) // → 2
    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-settings]')!) // open + → 3 + suspended
    expect(bubble()).toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })

    // The settings modal owns that Escape; the tour must survive it.
    expect(document.querySelector('[data-toolbar-settings-panel]')).toBeNull()
    expect(bubble()).not.toBeNull()
    expect(stepAttr()).toBe('3')
  })
})

describe('MilestoneRail tour — settings reopen & highlight', () => {
  it('settings → 重新查看教程 replays from bubble 0 (flag already set)', () => {
    const { backing } = renderOnboardingRail({ onboarded: true })
    advancePastDelay()
    expect(bubble()).toBeNull()

    // Open settings: expand the folded toolbar, then the gear.
    const expand = document.querySelector<HTMLElement>('[data-toolbar-expand]')
    if (expand === null) throw new Error('data-toolbar-expand not found')
    fireEvent.click(expand)
    const gear = document.querySelector<HTMLElement>('[data-toolbar-settings]')
    if (gear === null) throw new Error('data-toolbar-settings not found')
    fireEvent.click(gear)
    expect(document.querySelector('[data-toolbar-settings-panel]')).not.toBeNull()

    fireEvent.click(document.querySelector<HTMLElement>('[data-onboarding-reopen]')!)

    expect(document.querySelector('[data-toolbar-settings-panel]')).toBeNull()
    expect(bubble()).not.toBeNull()
    expect(stepAttr()).toBe('0')
    expect(document.querySelector('[data-rail-list]')).toHaveAttribute('data-tour-highlight')
    // Skipping the replay re-persists the flag ('1' stays '1').
    fireEvent.click(skipBtn())
    expect(bubble()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('reopen while the tour is open and suspended behind settings restarts from bubble 0', () => {
    const { backing } = renderOnboardingRail()
    openTour()
    fireEvent.click(primaryBtn()) // 1
    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-expand]')!) // → 2
    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-settings]')!) // open + suspended
    expect(bubble()).toBeNull()

    fireEvent.click(document.querySelector<HTMLElement>('[data-onboarding-reopen]')!)

    expect(document.querySelector('[data-toolbar-settings-panel]')).toBeNull()
    expect(bubble()).not.toBeNull()
    expect(stepAttr()).toBe('0')
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('the highlight ring rides exactly ONE real target and moves on step change', () => {
    renderOnboardingRail()
    openTour()

    expect(document.querySelector('[data-tour-highlight]')).toBe(document.querySelector('[data-rail-list]'))

    fireEvent.click(primaryBtn()) // → 1
    expect(document.querySelector('[data-tour-highlight]')).toBe(document.querySelector('[data-toolbar-expand]'))
    // The previous target lost the attribute (never two rings at once).
    expect(document.querySelector('[data-rail-list]')).not.toHaveAttribute('data-tour-highlight')

    fireEvent.click(primaryBtn()) // 2 (fallback — force-expands)
    expect(document.querySelector('[data-tour-highlight]')).toBe(document.querySelector('[data-toolbar-settings]'))
    expect(document.querySelector('[data-toolbar-expand]')).not.toHaveAttribute('data-tour-highlight')
  })
})