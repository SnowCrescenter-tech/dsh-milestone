/**
 * Component tests for the 0.6.4 first-run tutorial (MilestoneOnboarding,
 * mounted by MilestoneRail):
 *   - mount trigger: ~800ms after the rail mounts, WITHOUT a persisted
 *     `dsh-milestone.onboarded` flag the welcome page appears; WITH the flag
 *     it never appears
 *   - welcome → 开始引导 → four step pages with prev/next, progress text,
 *     4 progress dots (aria-current on the active one); the last page's
 *     开始使用 persists the flag and closes
 *   - skipping (welcome page, any step page, or Escape) always persists the
 *     flag and closes
 *   - settings → 重新查看教程 replays the tutorial immediately (even when the
 *     flag is already set), closing settings first
 *   - the built-in demos: step-1 hover tooltip + click ring, step-2 search
 *     N/M counting + bookmark-star toggle, step-3 legend, step-4 support links
 *   - an en dictionary flips the tutorial copy
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
import { PLUGIN_NPM_URL, PLUGIN_REPO_URL } from './version-meta.ts'
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

/** Drive past the mount delay WITHOUT the tutorial popping when flagged. */
function advancePastDelay(): void {
  act(() => {
    vi.advanceTimersByTime(MOUNT_DELAY + 100)
  })
}

function overlay(): HTMLElement | null {
  return document.querySelector('[data-onboarding-overlay]')
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-onboarding-panel]')
}

function welcome(): HTMLElement | null {
  return document.querySelector('[data-onboarding-welcome]')
}

function startBtn(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-onboarding-start]')
  if (el === null) throw new Error('data-onboarding-start not found')
  return el
}

function skipBtn(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-onboarding-skip]')
  if (el === null) throw new Error('data-onboarding-skip not found')
  return el
}

function prevBtn(): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>('[data-onboarding-prev]')
  if (el === null) throw new Error('data-onboarding-prev not found')
  return el
}

function nextBtn(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-onboarding-next]')
  if (el === null) throw new Error('data-onboarding-next not found (step 4 has 开始使用 instead)')
  return el
}

function finishBtn(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-onboarding-finish]')
  if (el === null) throw new Error('data-onboarding-finish not found (only on step 4)')
  return el
}

function stepPage(): HTMLElement | null {
  return document.querySelector('[data-onboarding-step]')
}

function progressText(): string | null {
  return document.querySelector('[data-onboarding-progress]')?.textContent ?? null
}

function progressDots(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-onboarding-progress-dot]')]
}

/** Welcome → step 1 (the shared preamble of the demo tests). */
function enterTour(): void {
  openTour()
  fireEvent.click(startBtn())
}

describe('MilestoneRail onboarding — trigger & flag (0.6.4)', () => {
  it('first mount without the flag shows the welcome page ~800ms later', () => {
    const { backing } = renderOnboardingRail()
    expect(overlay()).toBeNull()

    openTour()

    expect(overlay()).not.toBeNull()
    expect(welcome()).not.toBeNull()
    const dialog = panel()!
    expect(dialog).toHaveAttribute('role', 'dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog.getAttribute('aria-label')).toBe('欢迎使用 dsh-milestone')
    expect(welcome()!.textContent).toContain('欢迎使用 dsh-milestone')
  })

  it('the impression persists at once — display alone writes the flag; unmount/refresh never re-pops', () => {
    const backing = new Map<string, string>()
    renderOnboardingRail({ backing })
    openTour()
    expect(overlay()).not.toBeNull()
    // 印象即持久化: no skip/finish/Escape yet — the welcome page merely
    // displayed, and the marker is already '1' in storage.
    expect(backing.get(ONBOARDED_KEY)).toBe('1')

    // 直接卸载/关页模拟: tear the tree down without clicking anything.
    cleanup()

    // The same storage remounts (a fresh page load in the same browser):
    // the persisted marker must suppress the tutorial entirely.
    renderOnboardingRail({ backing })
    advancePastDelay()
    expect(overlay()).toBeNull()
  })

  it('a persisted flag suppresses the tutorial entirely', () => {
    renderOnboardingRail({ onboarded: true })

    advancePastDelay()

    expect(overlay()).toBeNull()
  })

  it('an en dictionary flips the welcome + step copy', () => {
    renderOnboardingRail({ dict: en as Record<string, string> })
    openTour()

    expect(welcome()!.textContent).toContain('Welcome to dsh-milestone')
    fireEvent.click(startBtn())
    expect(stepPage()!.getAttribute('data-step')).toBe('1')
    expect(stepPage()!.textContent).toContain('The dot timeline')
    expect(document.querySelector<HTMLElement>('[data-demo-dot]')!.getAttribute('aria-label')).toBe(
      'Help me optimize this code',
    )
  })
})

describe('MilestoneRail onboarding — navigation & persistence', () => {
  it('welcome → start → four steps (next/prev/progress dots) → 开始使用 persists and closes', () => {
    const { backing } = renderOnboardingRail()
    openTour()
    fireEvent.click(startBtn())

    // Step 1: back is disabled, progress reads 第 1 / 4 步.
    expect(stepPage()!.getAttribute('data-step')).toBe('1')
    expect(progressText()).toBe('第 1 / 4 步')
    expect(prevBtn()).toBeDisabled()

    fireEvent.click(nextBtn())
    expect(stepPage()!.getAttribute('data-step')).toBe('2')
    expect(progressText()).toBe('第 2 / 4 步')

    // Back returns to step 1, then forward to the last page.
    fireEvent.click(prevBtn())
    expect(stepPage()!.getAttribute('data-step')).toBe('1')
    fireEvent.click(nextBtn()) // 2
    fireEvent.click(nextBtn()) // 3
    fireEvent.click(nextBtn()) // 4
    expect(stepPage()!.getAttribute('data-step')).toBe('4')
    expect(progressText()).toBe('第 4 / 4 步')

    // Progress dots: 4 total, exactly one active, carrying aria-current.
    const dots = progressDots()
    expect(dots).toHaveLength(4)
    const active = dots.filter((d) => d.dataset.active === 'true')
    expect(active).toHaveLength(1)
    expect(active[0]).toHaveAttribute('aria-current', 'step')
    expect(active[0].getAttribute('aria-label')).toBe('第 4 步')

    // The last page's primary action is 开始使用 — persists + closes.
    expect(finishBtn().textContent).toBe('开始使用')
    fireEvent.click(finishBtn())
    expect(overlay()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('each step page renders its own title, description lines, and demo area', () => {
    renderOnboardingRail()
    openTour()
    fireEvent.click(startBtn())

    const expectedTitles = ['圆点时间线', '搜索与收藏', '个性化与设置', '更新检测与支持']
    for (let step = 1; step <= 4; step += 1) {
      expect(stepPage()!.getAttribute('data-step')).toBe(String(step))
      expect(stepPage()!.textContent).toContain(expectedTitles[step - 1])
      expect(stepPage()!.querySelectorAll('[data-onboarding-step-desc]').length).toBeGreaterThanOrEqual(2)
      expect(stepPage()!.querySelector('[data-onboarding-demo]')).not.toBeNull()
      // The corner skip lives on every step page.
      expect(skipBtn().textContent).toBe('跳过')
      if (step < 4) fireEvent.click(nextBtn())
      else expect(finishBtn()).not.toBeNull()
    }
  })

  it('skipping from the welcome page persists and closes', () => {
    const { backing } = renderOnboardingRail()
    openTour()

    fireEvent.click(skipBtn())

    expect(overlay()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('skipping from a step page persists and closes', () => {
    const { backing } = renderOnboardingRail()
    openTour()
    fireEvent.click(startBtn())
    fireEvent.click(nextBtn()) // step 2

    fireEvent.click(skipBtn())

    expect(overlay()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('Escape equals skip — persists and closes from any page', () => {
    const { backing } = renderOnboardingRail()
    openTour()
    fireEvent.click(startBtn())
    fireEvent.click(nextBtn()) // step 2

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(overlay()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('settings → 重新查看教程 closes settings and replays the tutorial (flag already set)', () => {
    const { backing } = renderOnboardingRail({ onboarded: true })
    advancePastDelay()
    expect(overlay()).toBeNull()

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
    expect(overlay()).not.toBeNull()
    expect(welcome()).not.toBeNull()
    // Skipping the replay re-persists the flag ('1' stays '1').
    fireEvent.click(skipBtn())
    expect(overlay()).toBeNull()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })
})

describe('MilestoneRail onboarding — built-in demos', () => {
  it('step 1: hovering a toy dot shows fake metadata; clicking marks the active ring', () => {
    renderOnboardingRail()
    enterTour()

    const dots = [...document.querySelectorAll<HTMLElement>('[data-demo-dot]')]
    expect(dots).toHaveLength(5)
    expect(document.querySelector('[data-demo-tooltip]')).toBeNull()

    fireEvent.mouseEnter(dots[0])
    const tip = document.querySelector<HTMLElement>('[data-demo-tooltip]')
    expect(tip).not.toBeNull()
    expect(tip!.textContent).toContain('第 1 / 5 条')
    expect(tip!.textContent).toContain('用时')

    fireEvent.click(dots[0])
    expect(dots[0]).toHaveAttribute('data-active', 'true')
    expect(dots[0]).toHaveAttribute('aria-pressed', 'true')
  })

  it('step 2: the toy search counts N/M and the star toggles bookmarks-only', () => {
    renderOnboardingRail()
    enterTour()
    fireEvent.click(nextBtn()) // step 2

    const count = () => document.querySelector<HTMLElement>('[data-demo-search-count]')!.textContent
    expect(count()).toBe('5 / 5')

    const input = document.querySelector<HTMLInputElement>('[data-demo-search-input]')!
    expect(input.getAttribute('placeholder')).toBe('搜索消息内容')
    fireEvent.change(input, { target: { value: '报错' } })
    expect(count()).toBe('1 / 5')
    // The matching row lights up; the 4 non-matching rows dim.
    const rows = [...document.querySelectorAll<HTMLElement>('[data-demo-search-row]')]
    expect(rows).toHaveLength(5)
    expect(rows.filter((r) => r.dataset.lit === 'true')).toHaveLength(1)
    expect(rows.find((r) => r.dataset.lit === 'true')!.textContent).toContain('报错')

    // The star: off → solid + 只看收藏 filtering (only the starred row stays).
    const star = document.querySelector<HTMLElement>('[data-demo-star]')!
    expect(star.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(star)
    expect(star.getAttribute('aria-pressed')).toBe('true')
    expect(count()).toBe('1 / 1')
    expect(document.querySelectorAll('[data-demo-search-row]')).toHaveLength(1)
  })

  it('step 3: the personalization legend + the 展开箭头 → 齿轮 → 设置 path hint', () => {
    renderOnboardingRail()
    enterTour()
    fireEvent.click(nextBtn())
    fireEvent.click(nextBtn()) // step 3

    expect(document.querySelector('[data-demo-settings-path]')!.textContent).toBe('展开箭头 → 齿轮 → 设置')
    const rows = [...document.querySelectorAll<HTMLElement>('[data-demo-legend-row]')]
    expect(rows).toHaveLength(7)
    const labels = rows.map((r) => r.textContent).join('')
    expect(labels).toContain('强调色')
    expect(labels).toContain('圆点大小')
    expect(labels).toContain('距侧边距离')
    expect(labels).toContain('位置')
    expect(labels).toContain('语言')
    expect(labels).toContain('聚焦搭配')
    expect(labels).toContain('pin 固定')
  })

  it('step 4: update pill + the four support links (repo/star/issues/npm)', () => {
    renderOnboardingRail()
    enterTour()
    fireEvent.click(nextBtn())
    fireEvent.click(nextBtn())
    fireEvent.click(nextBtn()) // step 4

    expect(document.querySelector('[data-demo-update-pill]')).not.toBeNull()
    const links = [...document.querySelectorAll<HTMLAnchorElement>('[data-demo-link]')]
    expect(links).toHaveLength(4)
    const hrefOf = (kind: string) => links.find((l) => l.getAttribute('data-link') === kind)!.getAttribute('href')
    expect(hrefOf('repo')).toBe(PLUGIN_REPO_URL)
    expect(hrefOf('star')).toBe(PLUGIN_REPO_URL)
    expect(hrefOf('issues')).toBe(`${PLUGIN_REPO_URL}/issues`)
    expect(hrefOf('npm')).toBe(PLUGIN_NPM_URL)
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
  })
})