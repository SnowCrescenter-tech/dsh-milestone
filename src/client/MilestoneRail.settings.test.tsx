/**
 * Component tests for the settings MODAL's personalization section (B-design
 * requirement 6): accent presets + custom color, icon/dot size slider, edge
 * distance slider, and the left/right side radio — every control writes
 * through to the toolbar prefs blob immediately and drives the rail's CSS
 * variables + data attributes; the rail side flips every floating layer to the
 * rail's other side.
 *
 * 0.6.3 focus block: the same collapsible-section pattern now also hosts the
 * focus "聚焦搭配" controls (dim think / dim tools / collapse think + the
 * strength slider), persisted under `prefs.focus` and reset by 恢复默认.
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

/** Expand the collapsed-by-default personalization block (its controls only
 * exist in the DOM while the block is open). */
function expandPersonal() {
  const toggle = document.querySelector<HTMLElement>('[data-personal-toggle]')
  if (toggle === null) throw new Error('data-personal-toggle not found')
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
}

/** Expand the collapsed-by-default focus block (0.6.3). */
function expandFocus() {
  const toggle = document.querySelector<HTMLElement>('[data-focus-toggle-settings]')
  if (toggle === null) throw new Error('data-focus-toggle-settings not found')
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
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
    expandPersonal()

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
    expandPersonal()

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
    expandPersonal()
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
    expandPersonal()

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
    expandPersonal()

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

  it('the personalization block defaults COLLAPSED with a live summary; expanding reveals the controls', () => {
    const { backing } = renderSettingsRail()
    openSettings()

    const toggle = document.querySelector<HTMLElement>('[data-personal-toggle]')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // Controls are not rendered while the block is collapsed.
    expect(document.querySelector('input[data-icon-size]')).toBeNull()
    expect(document.querySelector('[data-accent-swatch]')).toBeNull()
    // The header leads with one live value summary (default values).
    expect(document.querySelector('[data-settings-personal-summary]')!.textContent).toContain('图标 28px')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('input[data-icon-size]')).not.toBeNull()
    expect(document.querySelector('[data-accent-swatch][data-accent="#4d7cfd"]')).not.toBeNull()

    // Adjusting a control updates the summary immediately (即调即存).
    fireEvent.click(document.querySelector('[data-accent-swatch][data-accent="#22c55e"]')!)
    expect(document.querySelector('[data-settings-personal-summary]')!.textContent).toContain('#22c55e')
    expect(storedPrefs(backing).accent).toBe('#22c55e')

    // Collapsing again unmounts the controls but keeps the updated summary.
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('input[data-icon-size]')).toBeNull()
    expect(document.querySelector('[data-settings-personal-summary]')!.textContent).toContain('#22c55e')
  })
})

describe('MilestoneRail settings — focus block (0.6.3 focus mix)', () => {
  it('defaults COLLAPSED with a live summary; expanding reveals the options and the strength slider', () => {
    const { backing } = renderSettingsRail()
    openSettings()

    const toggle = document.querySelector<HTMLElement>('[data-focus-toggle-settings]')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    // Controls are not rendered while the block is collapsed.
    expect(document.querySelector('[data-focus-dim-think]')).toBeNull()
    expect(document.querySelector('[data-focus-opacity]')).toBeNull()
    // The header leads with one live value summary (defaults: think dim 40%).
    expect(document.querySelector('[data-focus-summary]')!.textContent).toBe('think 淡化 · 强度 40%')

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const dimThink = document.querySelector<HTMLInputElement>('[data-focus-dim-think]')!
    expect(dimThink).not.toBeNull()
    expect(dimThink.checked).toBe(true)
    const dimTools = document.querySelector<HTMLInputElement>('[data-focus-dim-tools]')!
    expect(dimTools.checked).toBe(false)
    const collapseThink = document.querySelector<HTMLInputElement>('[data-focus-collapse-think]')!
    expect(collapseThink.checked).toBe(false)
    const slider = document.querySelector<HTMLInputElement>('input[data-focus-opacity]')!
    expect(slider.value).toBe('0.4')
    expect(document.querySelector('[data-focus-opacity-value]')!.textContent).toBe('40%')

    // Adjusting a control updates the summary immediately (即调即存).
    fireEvent.click(dimTools)
    expect(document.querySelector('[data-focus-summary]')!.textContent).toBe('think 淡化 · 工具淡化 · 强度 40%')
    expect(storedPrefs(backing).focus.dimTools).toBe(true)

    // Collapsing again unmounts the controls but keeps the updated summary.
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelector('[data-focus-dim-think]')).toBeNull()
    expect(document.querySelector('[data-focus-summary]')!.textContent).toBe('think 淡化 · 工具淡化 · 强度 40%')
  })

  it('every focus control writes through to the persisted blob (mixed recipe)', () => {
    const { backing } = renderSettingsRail()
    openSettings()
    expandFocus()

    fireEvent.click(document.querySelector<HTMLInputElement>('[data-focus-dim-think]')!)
    fireEvent.click(document.querySelector<HTMLInputElement>('[data-focus-dim-tools]')!)
    fireEvent.click(document.querySelector<HTMLInputElement>('[data-focus-collapse-think]')!)
    const slider = document.querySelector<HTMLInputElement>('input[data-focus-opacity]')!
    fireEvent.change(slider, { target: { value: '0.3' } })

    // Value display follows the slider.
    expect(document.querySelector('[data-focus-opacity-value]')!.textContent).toBe('30%')

    const stored = storedPrefs(backing)
    expect(stored.focus).toEqual({
      dimThink: false,
      dimTools: true,
      collapseThink: true,
      opacity: 0.3,
    })
    // The summary reads the mixed recipe: 工具淡化 · 折叠 think · 强度 30%.
    expect(document.querySelector('[data-focus-summary]')!.textContent).toBe('工具淡化 · 折叠 think · 强度 30%')
    // Unrelated prefs stayed untouched.
    expect(stored.accent).toBe('#4d7cfd')
  })

  it('seeding a custom focus mix in the blob hydrates the block and its summary', () => {
    renderSettingsRail({
      prefs: JSON.stringify({
        ...DEFAULT_PREFS,
        focus: { dimThink: false, dimTools: true, collapseThink: false, opacity: 0.2 },
      }),
    })
    openSettings()

    expect(document.querySelector('[data-focus-summary]')!.textContent).toBe('工具淡化 · 强度 20%')

    expandFocus()
    expect(document.querySelector<HTMLInputElement>('[data-focus-dim-think]')!.checked).toBe(false)
    expect(document.querySelector<HTMLInputElement>('[data-focus-dim-tools]')!.checked).toBe(true)
    expect(document.querySelector<HTMLInputElement>('input[data-focus-opacity]')!.value).toBe('0.2')
  })

  it('恢复默认 resets the focus mix together with pins and appearance', () => {
    const { backing } = renderSettingsRail({
      prefs: JSON.stringify({
        ...DEFAULT_PREFS,
        pinned: ['focus'],
        iconSize: 32,
        focus: { dimThink: true, dimTools: true, collapseThink: true, opacity: 0.8 },
      }),
    })
    openSettings()
    expandFocus()

    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-settings-reset]')!)

    expect(document.querySelector<HTMLInputElement>('[data-focus-dim-think]')!.checked).toBe(true)
    expect(document.querySelector<HTMLInputElement>('[data-focus-dim-tools]')!.checked).toBe(false)
    expect(document.querySelector<HTMLInputElement>('[data-focus-collapse-think]')!.checked).toBe(false)
    expect(document.querySelector<HTMLInputElement>('input[data-focus-opacity]')!.value).toBe('0.4')
    expect(document.querySelector('[data-focus-summary]')!.textContent).toBe('think 淡化 · 强度 40%')
    expect(backing.get(TOOLBAR_PREFS_KEY)).toBe(JSON.stringify(DEFAULT_PREFS))
  })
})