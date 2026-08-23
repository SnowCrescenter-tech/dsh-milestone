/**
 * Component tests for the milestone rail's collapsible toolbar (B1 + B-design):
 * the function-key area defaults to FOLDED — only the expand arrow (plus the
 * user's pinned features) renders; expanding reveals EVERY function key,
 * including the settings gear as a REGULAR feature at the end of the queue
 * (default unpinned). The gear opens a CENTERED MODAL dialog (role=dialog,
 * aria-modal) with the feature pin switches + hover descriptions, the
 * personalization section, and a compact support-us card grid; the 恢复默认
 * action resets pins AND personalization together.
 *
 * The render helper mirrors ../test/renderRail.tsx but additionally seeds the
 * toolbar prefs blob (`dsh-milestone.toolbar`) so mount-time hydration of
 * pinned features is observable (renderRail.tsx is owned by an earlier phase —
 * untouched).
 *
 * DOM contract pinned here:
 *   - `[data-toolbar-expand]`              the expand/collapse arrow (aria-expanded).
 *   - `[data-toolbar-settings]`            the settings gear (aria-pressed, registry last).
 *   - `[data-toolbar-settings-panel]`      the settings MODAL panel (role=dialog).
 *   - `[data-toolbar-settings-overlay]`    the full-screen modal backdrop.
 *   - `[data-toolbar-settings-close]`      the modal close button.
 *   - `[data-toolbar-pin-toggle]`          one switch per feature (data-pin-id).
 *   - `[data-toolbar-settings-reset]`      the restore-defaults button.
 *   - `[data-toolbar-settings-footer]`     the support-us card grid.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { zh } from './locales.ts'
import { DEFAULT_PREFS, TOOLBAR_PIN_IDS, TOOLBAR_PREFS_KEY } from './toolbar-prefs.ts'
import { PLUGIN_NPM_URL, PLUGIN_REPO_URL } from './version-meta.ts'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'
import { buildSnapshot } from '../test/snapshot-fixture.ts'
import type { RailUser } from '../test/renderRail.tsx'

const USERS: RailUser[] = [
  { key: '13:user<tb-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<tb-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
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

/** Render the rail with an optional pre-seeded toolbar prefs blob. */
function renderToolbarRail(users: RailUser[] = USERS, opts?: { prefs?: string }) {
  const snapshot = buildSnapshot({ users })
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
        {users.map((user) => (
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

/** The expand/collapse arrow button. */
function expandButton(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (el === null) throw new Error('data-toolbar-expand not found')
  return el
}

/** The settings gear button (a REGULAR feature — null while collapsed+unpinned). */
function gearButton(): HTMLElement | null {
  return document.querySelector('[data-toolbar-settings]')
}

function settingsPanel(): HTMLElement | null {
  return document.querySelector('[data-toolbar-settings-panel]')
}

/**
 * Open the settings modal following the REAL path: expand the folded toolbar
 * (the gear is a default-unpinned feature), then click the gear.
 */
function openSettings() {
  const expand = expandButton()
  if (expand.getAttribute('aria-expanded') !== 'true') fireEvent.click(expand)
  const gear = gearButton()
  if (gear === null) throw new Error('gear not found after expanding the toolbar')
  if (settingsPanel() === null) fireEvent.click(gear)
}

/** Every collapsible feature toggle present in the DOM. */
function featureTogglesPresent(): string[] {
  return TOOLBAR_PIN_IDS.filter((id) => {
    switch (id) {
      case 'search': return document.querySelector('[data-search-toggle]') !== null
      case 'list': return document.querySelector('[data-list-toggle]') !== null
      case 'sessionSearch': return document.querySelector('[data-session-search-toggle]') !== null
      case 'bookmarks': return document.querySelector('[data-bookmarks-toggle]') !== null
      case 'focus': return document.querySelector('[data-focus-toggle]') !== null
      case 'updateCheck': return document.querySelector('[data-update-check]') !== null
      case 'settings': return document.querySelector('[data-toolbar-settings]') !== null
    }
  })
}

/** A settings-menu pin toggle by feature id (switch). */
function pinToggle(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-toolbar-pin-toggle][data-pin-id="${id}"]`)
  if (el === null) throw new Error(`pin toggle for ${id} not found`)
  return el
}

describe('MilestoneRail collapsible toolbar (B1 + B-design)', () => {
  it('defaults COLLAPSED: only the expand arrow renders (the gear is a regular feature, unpinned)', () => {
    renderToolbarRail()

    const expand = expandButton()
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(expand).toHaveAttribute('aria-label', '展开工具栏')

    // B-design: no pinned feature, NO gear — the collapsed rail holds only the
    // expand arrow until the user pins something (or expands).
    expect(gearButton()).toBeNull()
    expect(featureTogglesPresent()).toEqual([])
    expect(settingsPanel()).toBeNull()
  })

  it('expanding flips aria-expanded and reveals every function key incl. the settings gear; collapsing tucks them away', () => {
    renderToolbarRail()

    fireEvent.click(expandButton())
    const expand = expandButton()
    expect(expand).toHaveAttribute('aria-expanded', 'true')
    expect(expand).toHaveAttribute('aria-label', '收起工具栏')
    expect(featureTogglesPresent()).toEqual([...TOOLBAR_PIN_IDS])

    // The legacy data attributes survive inside the expanded toolbar; the
    // settings gear is a feature too (data-toolbar-settings, aria-pressed).
    expect(document.querySelector('[data-bookmarks-toggle]')).not.toBeNull()
    expect(document.querySelector('[data-focus-toggle]')).not.toBeNull()
    expect(document.querySelector('[data-list-toggle]')).not.toBeNull()
    expect(document.querySelector('[data-session-search-toggle]')).not.toBeNull()
    expect(document.querySelector('[data-search-toggle]')).not.toBeNull()
    expect(gearButton()).not.toBeNull()
    expect(gearButton()).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(expand)
    expect(expandButton()).toHaveAttribute('aria-expanded', 'false')
    expect(featureTogglesPresent()).toEqual([])
  })

  it('the settings gear is LAST in the expanded feature queue (after update-check)', () => {
    renderToolbarRail()
    fireEvent.click(expandButton())

    const update = document.querySelector<HTMLElement>('[data-update-check]')
    const gear = gearButton()
    expect(update).not.toBeNull()
    expect(gear).not.toBeNull()
    const position = update!.compareDocumentPosition(gear!)
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('a PINNED settings gear survives the collapsed state (it is a normal feature)', () => {
    renderToolbarRail(USERS, { prefs: JSON.stringify({ ...DEFAULT_PREFS, pinned: ['settings'] }) })

    expect(expandButton()).toHaveAttribute('aria-expanded', 'false')
    expect(gearButton()).not.toBeNull()
    expect(featureTogglesPresent()).toEqual(['settings'])
  })

  it('the settings gear opens the CENTERED MODAL; backdrop pointerdown and re-click close it', () => {
    renderToolbarRail()
    openSettings()

    const gear = gearButton()!
    expect(gear).toHaveAttribute('aria-pressed', 'true')
    expect(gear).toHaveAttribute('aria-label', '关闭设置')

    // Centered modal contract: fixed overlay + role=dialog + aria-modal.
    const panel = settingsPanel()
    expect(panel).not.toBeNull()
    expect(panel).toHaveAttribute('role', 'dialog')
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(panel).toHaveAttribute('aria-label', '设置')
    expect(document.querySelector('[data-toolbar-settings-overlay]')).not.toBeNull()
    expect(document.querySelector('[data-toolbar-settings-close]')).not.toBeNull()
    // Requirement: focus moves INTO the modal while it is open.
    expect(document.activeElement).toBe(document.querySelector('[data-toolbar-settings-close]'))

    // Content sections: 功能与快捷区 / 个性化 / 支持我们.
    expect(screen.getByText('功能与快捷区')).not.toBeNull()
    expect(screen.getByText('个性化')).not.toBeNull()
    expect(screen.getByText('支持我们')).not.toBeNull()

    // One switch per feature, none pinned by default.
    expect(document.querySelectorAll('[data-toolbar-pin-toggle]')).toHaveLength(TOOLBAR_PIN_IDS.length)
    for (const id of TOOLBAR_PIN_IDS) {
      expect(pinToggle(id)).toHaveAttribute('aria-checked', 'false')
    }

    // The hover-description pane is visible by default (first feature).
    const desc = document.querySelector('[data-settings-desc]')
    expect(desc).not.toBeNull()
    expect(desc!.textContent).toContain('按完整消息内容过滤并跳转')

    // Backdrop pointerdown dismisses (the overlay wraps the dialog, so any
    // pointerdown outside the dialog — document.body here — closes it).
    fireEvent.pointerDown(document.body)
    expect(settingsPanel()).toBeNull()
    expect(gear).toHaveAttribute('aria-pressed', 'false')

    // The gear's own click re-opens/closes (kept outside the dismissal hook).
    fireEvent.click(gear)
    expect(settingsPanel()).not.toBeNull()
    fireEvent.click(gear)
    expect(settingsPanel()).toBeNull()
  })

  it('the modal close button closes the dialog and returns focus to the gear', () => {
    renderToolbarRail()
    openSettings()
    expect(settingsPanel()).not.toBeNull()

    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-settings-close]')!)
    expect(settingsPanel()).toBeNull()
    expect(document.activeElement).toBe(gearButton())
  })

  it('Escape closes the settings modal and returns focus to the gear', () => {
    renderToolbarRail()
    openSettings()
    expect(settingsPanel()).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(settingsPanel()).toBeNull()
    expect(document.activeElement).toBe(gearButton())
  })

  it('hovering a feature row reveals its description in the modal pane', () => {
    renderToolbarRail()
    openSettings()

    const desc = document.querySelector('[data-settings-desc]')!
    expect(desc.textContent).toContain('按完整消息内容过滤并跳转')

    fireEvent.mouseEnter(pinToggle('list'))
    expect(desc.textContent).toContain('本会话全部提问一览')

    fireEvent.mouseEnter(pinToggle('settings'))
    expect(desc.textContent).toContain('自定义工具栏与外观')
  })

  it('pinning a feature in settings keeps it visible while collapsed and persists the full blob', () => {
    const { backing } = renderToolbarRail()
    openSettings()

    const toggle = pinToggle('bookmarks')
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    // UI change writes through immediately: prefs = defaults + the new pin.
    expect(backing.get(TOOLBAR_PREFS_KEY)).toBe(
      JSON.stringify({ ...DEFAULT_PREFS, pinned: ['bookmarks'] }),
    )

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(settingsPanel()).toBeNull()

    // Collapse the toolbar: only the pinned bookmarks feature stays.
    fireEvent.click(expandButton())
    expect(expandButton()).toHaveAttribute('aria-expanded', 'false')
    expect(featureTogglesPresent()).toEqual(['bookmarks'])

    // The settings modal reflects the persisted pin when reopened.
    openSettings()
    expect(pinToggle('bookmarks')).toHaveAttribute('aria-checked', 'true')
    expect(pinToggle('focus')).toHaveAttribute('aria-checked', 'false')
  })

  it('mount-time hydration: a pre-seeded pinned blob renders those features while collapsed', () => {
    renderToolbarRail(USERS, {
      prefs: JSON.stringify({ ...DEFAULT_PREFS, pinned: ['search', 'focus'] }),
    })

    expect(expandButton()).toHaveAttribute('aria-expanded', 'false')
    expect(featureTogglesPresent()).toEqual(['search', 'focus'])
    expect(gearButton()).toBeNull()
    // The whole RailSearchUi renders pinned-collapsed — its toggle is there.
    expect(document.querySelector('[data-search-toggle]')).not.toBeNull()

    // The in-rail search panel still opens from the pinned toggle.
    fireEvent.click(document.querySelector('[data-search-toggle]')!)
    expect(document.querySelector('[data-rail-search]')).not.toBeNull()
  })

  it('mount-time hydration sanitizes the blob: unknown ids never render', () => {
    renderToolbarRail(USERS, {
      prefs: JSON.stringify({ ...DEFAULT_PREFS, pinned: ['ghost', 'list', 'ghost'] }),
    })

    expect(featureTogglesPresent()).toEqual(['list'])
  })

  it('reset clears every pin AND the personalization, persisting the canonical defaults', () => {
    const { backing } = renderToolbarRail(USERS, {
      prefs: JSON.stringify({
        ...DEFAULT_PREFS,
        pinned: ['bookmarks', 'focus'],
        accent: '#22c55e',
        iconSize: 32,
        inset: 8,
        side: 'left',
      }),
    })
    // Collapsed with the pinned features (custom prefs don't affect pins).
    expect(featureTogglesPresent()).toEqual(['bookmarks', 'focus'])

    openSettings()

    // Personalization controls reflect the seeded custom values first.
    expect(document.querySelector('[data-accent-swatch][data-accent="#22c55e"]')).not.toBeNull()
    expect(
      document.querySelector('[data-accent-swatch][data-accent="#22c55e"]')!.getAttribute('aria-pressed'),
    ).toBe('true')
    expect(document.querySelector<HTMLInputElement>('input[data-icon-size]')!.value).toBe('32')
    expect(document.querySelector<HTMLInputElement>('input[data-inset]')!.value).toBe('8')

    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-settings-reset]')!)

    // Every pin unchecks and the personalization snaps back to defaults.
    for (const id of TOOLBAR_PIN_IDS) {
      expect(pinToggle(id)).toHaveAttribute('aria-checked', 'false')
    }
    expect(document.querySelector('[data-accent-swatch][data-accent="#4d7cfd"]')).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector<HTMLInputElement>('input[data-icon-size]')!.value).toBe('28')
    expect(document.querySelector<HTMLInputElement>('input[data-inset]')!.value).toBe('14')
    expect(
      document.querySelector<HTMLInputElement>('[data-side-radio][value="right"]')!.checked,
    ).toBe(true)
    expect(backing.get(TOOLBAR_PREFS_KEY)).toBe(JSON.stringify(DEFAULT_PREFS))

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(expandButton())
    expect(featureTogglesPresent()).toEqual([])
  })

  it('the support-us FOOTER is a 2×2 card grid linking repo/issues/npm with _blank+noreferrer', () => {
    renderToolbarRail()
    openSettings()

    const footer = document.querySelector('[data-toolbar-settings-footer]')
    expect(footer).not.toBeNull()
    expect(footer?.textContent).toContain('支持我们')

    const cards = [...footer!.querySelectorAll<HTMLAnchorElement>('[data-support-card]')]
    expect(cards).toHaveLength(4)
    const hrefs = cards.map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      PLUGIN_REPO_URL,
      PLUGIN_REPO_URL,
      `${PLUGIN_REPO_URL}/issues`,
      PLUGIN_NPM_URL,
    ])
    for (const link of cards) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
    expect(screen.getByText('GitHub 仓库')).not.toBeNull()
    expect(screen.getByText('欢迎 Star ★')).not.toBeNull()
    expect(screen.getByText('提交 Issue')).not.toBeNull()
    expect(screen.getByText('npm 安装渠道')).not.toBeNull()
  })

  it('the function keys still work while expanded (bookmarks filter + search panel open)', () => {
    renderToolbarRail()

    fireEvent.click(expandButton())
    const bookmarks = document.querySelector<HTMLElement>('[data-bookmarks-toggle]')!
    fireEvent.click(bookmarks)
    expect(bookmarks).toHaveAttribute('data-active', 'true')
    expect(bookmarks).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(document.querySelector<HTMLElement>('[data-search-toggle]')!)
    expect(document.querySelector('[data-rail-search]')).not.toBeNull()
  })
})