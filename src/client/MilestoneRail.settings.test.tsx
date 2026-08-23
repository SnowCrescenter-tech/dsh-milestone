/**
 * Component tests for the settings MODAL's personalization section (B-design
 * requirement 6): accent presets + custom color, icon/dot size slider, edge
 * distance slider, and the left/right side radio — every control writes
 * through to the toolbar prefs blob immediately and drives the rail's CSS
 * variables + data attributes; the rail side flips every floating layer to the
 * rail's other side.
 *
 * The render helper mirrors MilestoneRail.toolbar.test.tsx (renderRail.tsx is
 * owned by an earlier phase — untouched).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { zh } from './locales.ts'
import { DEFAULT_PREFS, TOOLBAR_PREFS_KEY } from './toolbar-prefs.ts'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'
import { buildSnapshot } from '../test/snapshot-fixture.ts'
import type { RailUser } from '../test/renderRail.tsx'

const USERS: RailUser[] = [
  { key: '13:user<st-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<st-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

afterEach(() => {
  cleanup()
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

/** Render the rail with an optional pre-seeded prefs blob. */
function renderSettingsRail(opts?: { prefs?: string }) {
  const snapshot = buildSnapshot({ users: USERS })
  const useSession = (selector: (snap: ConversationSnapshotFixture) => unknown) => selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const useProjection = () => undefined
  const t = makeT(zh as Record<string, string>)
  const forkAt = vi.fn(async () => 'child-id')

  const backing = new Map<string, string>()
  if (opts?.prefs !== undefined) backing.set(TOOLBAR_PREFS_KEY, opts.prefs)
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

/** The rail root (identified by the rail.label aria-label). */
function railRoot(): HTMLElement {
  const el = document.querySelector<HTMLElement>('div[aria-label="会话里程碑"]')
  if (el === null) throw new Error('rail root not found')
  return el
}

function expandButton(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (el === null) throw new Error('data-toolbar-expand not found')
  return el
}

function gearButton(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-toolbar-settings]')
  if (el === null) throw new Error('data-toolbar-settings not found (expand the toolbar first)')
  return el
}

function settingsPanel(): HTMLElement | null {
  return document.querySelector('[data-toolbar-settings-panel]')
}

/** Expand the folded toolbar and open the settings modal. */
function openSettings() {
  const expand = expandButton()
  if (expand.getAttribute('aria-expanded') !== 'true') fireEvent.click(expand)
  if (settingsPanel() === null) fireEvent.click(gearButton())
}

/** The nth dot button (1-based, matching its 跳转到第 N 条消息 label). */
function dot(n: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(`button[aria-label="跳转到第 ${n} 条消息"]`)
  if (el === null) throw new Error(`dot ${n} not found`)
  return el
}

/** The inner dot span of the nth dot (carries the accent gradient). */
function dotSpan(n: number): HTMLElement {
  const span = dot(n).querySelector<HTMLElement>('span')
  if (span === null) throw new Error(`dot ${n} has no inner span`)
  return span
}

/** Last stored toolbar blob, parsed. */
function storedPrefs(backing: Map<string, string>): ReturnType<typeof JSON.parse> {
  return JSON.parse(backing.get(TOOLBAR_PREFS_KEY)!)
}

describe('MilestoneRail settings personalization (B-design #6)', () => {
  it('the rail root carries the personalization as data attributes + CSS variables', () => {
    const { backing } = renderSettingsRail()
    const root = railRoot()

    expect(root).toHaveAttribute('data-accent', '#4d7cfd')
    expect(root).toHaveAttribute('data-side', 'right')
    expect(root).toHaveAttribute('data-icon-size', '28')
    expect(root).toHaveAttribute('data-inset', '14')
    expect(root.style.getPropertyValue('--ms-accent')).toBe('#4d7cfd')
    expect(root.style.getPropertyValue('--ms-inset')).toBe('14px')
    expect(root.style.getPropertyValue('--ms-icon')).toBe('28px')

    // Nothing was written to storage by a read-only mount.
    expect(backing.has(TOOLBAR_PREFS_KEY)).toBe(false)
  })

  it('a preset accent swatch retints the dots, the rail vars, and persists', () => {
    const { backing } = renderSettingsRail()
    openSettings()

    fireEvent.click(document.querySelector('[data-accent-swatch][data-accent="#22c55e"]')!)
    closeAndReopen()

    const root = railRoot()
    expect(root).toHaveAttribute('data-accent', '#22c55e')
    expect(root.style.getPropertyValue('--ms-accent')).toBe('#22c55e')
    // The dot gradient follows the accent hue (index 0 → lightness 72%);
    // jsdom normalizes the hsl() to rgb().
    expect(dotSpan(1).style.background).toBe('rgb(133, 234, 170)')
    // The swatch reports being selected; the previous default unselects.
    expect(
      document.querySelector('[data-accent-swatch][data-accent="#22c55e"]')!.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      document.querySelector('[data-accent-swatch][data-accent="#4d7cfd"]')!.getAttribute('aria-pressed'),
    ).toBe('false')
    expect(storedPrefs(backing).accent).toBe('#22c55e')

    function closeAndReopen() {
      fireEvent.keyDown(window, { key: 'Escape' })
      openSettings()
    }
  })

  it('the custom color input drives the accent too', () => {
    const { backing } = renderSettingsRail()
    openSettings()

    const custom = document.querySelector<HTMLInputElement>('[data-accent-custom] input[type="color"]')!
    fireEvent.change(custom, { target: { value: '#ff8800' } })

    expect(railRoot()).toHaveAttribute('data-accent', '#ff8800')
    expect(storedPrefs(backing).accent).toBe('#ff8800')
  })

  it('the icon/dot size slider scales the dots and the rail width, and persists', () => {
    const { backing } = renderSettingsRail()

    // Default: classic 28 hit / 14 dot.
    expect(dotSpan(1).style.width).toBe('14px')
    expect(railRoot().style.width).toBe('28px')

    openSettings()
    const slider = document.querySelector<HTMLInputElement>('input[data-icon-size]')!
    fireEvent.change(slider, { target: { value: '32' } })
    expect(document.querySelector('[data-icon-size-value]')!.textContent).toBe('32px')

    const root = railRoot()
    expect(root).toHaveAttribute('data-icon-size', '32')
    expect(root.style.getPropertyValue('--ms-icon')).toBe('32px')
    // 14 * 32/28 = 16px dot; hit area scales to 32px.
    expect(dotSpan(1).style.width).toBe('16px')
    expect(root.style.width).toBe('32px')
    expect(storedPrefs(backing).iconSize).toBe(32)
  })

  it('the edge-distance slider repositions the rail and persists (replaces RAIL_INSET)', () => {
    const { backing } = renderSettingsRail()
    openSettings()

    const slider = document.querySelector<HTMLInputElement>('input[data-inset]')!
    fireEvent.change(slider, { target: { value: '6' } })

    expect(railRoot()).toHaveAttribute('data-inset', '6')
    expect(railRoot().style.getPropertyValue('--ms-inset')).toBe('6px')
    expect(document.querySelector('[data-inset-value]')!.textContent).toBe('6px')
    expect(storedPrefs(backing).inset).toBe(6)
  })

  it('side=right (default): floating layers open to the LEFT of the rail', () => {
    renderSettingsRail()
    // The update key is visible while the toolbar is expanded.
    fireEvent.click(expandButton())
    fireEvent.click(document.querySelector<HTMLElement>('[data-update-check]')!)

    const panel = document.querySelector<HTMLElement>('[data-update-panel]')!
    const expectedRightSide = window.innerWidth + 14 + 28 + 8 // railBox.right + hit + 8
    expect(panel.style.right).toBe(`${expectedRightSide}px`)
  })

  it('side=left: the rail hugs the left edge and floating layers open to its RIGHT (other side)', () => {
    const { backing } = renderSettingsRail()
    openSettings()

    fireEvent.click(document.querySelector<HTMLInputElement>('[data-side-radio][value="left"]')!)
    expect(railRoot()).toHaveAttribute('data-side', 'left')
    // The rail root anchors via `left` now (distance from the viewport's left
    // edge = sp.left(0) + inset(14)).
    expect(railRoot().style.left).toBe('14px')
    expect(storedPrefs(backing).side).toBe('left')

    // Every floating layer flips to the rail's OTHER side: the update panel's
    // right edge = innerWidth − (left anchor + hit + 8 + panel width 280).
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(settingsPanel()).toBeNull()
    fireEvent.click(document.querySelector<HTMLElement>('[data-update-check]')!)
    const panel = document.querySelector<HTMLElement>('[data-update-panel]')!
    expect(panel.style.right).toBe(`${window.innerWidth - (14 + 28 + 8 + 280)}px`)
  })

  it('seeding side=left in the blob hydrates a left rail and its panel side immediately', () => {
    renderSettingsRail({
      prefs: JSON.stringify({ ...DEFAULT_PREFS, side: 'left', pinned: ['updateCheck'] }),
    })

    expect(railRoot()).toHaveAttribute('data-side', 'left')

    // The pinned update toggle opens its panel on the rail's right side.
    fireEvent.click(document.querySelector<HTMLElement>('[data-update-check]')!)
    const panel = document.querySelector<HTMLElement>('[data-update-panel]')!
    expect(panel.style.right).toBe(`${window.innerWidth - (14 + 28 + 8 + 280)}px`)
  })
})