/**
 * Component tests for the milestone rail's collapsible toolbar (B1): the
 * function-key area defaults to FOLDED — only the expand arrow and the
 * settings gear (plus the user's pinned features) render; expanding reveals
 * every function key; the settings menu lists each feature with a persisted
 * "show outside collapse" pin, a restore-defaults action, and the GitHub/npm
 * promo footer.
 *
 * The render helper mirrors ../test/renderRail.tsx but additionally seeds the
 * toolbar prefs blob (`dsh-milestone.toolbar`) so mount-time hydration of
 * pinned features is observable (renderRail.tsx is owned by an earlier phase —
 * untouched).
 *
 * DOM contract pinned here:
 *   - `[data-toolbar-expand]`         the expand/collapse arrow (aria-expanded).
 *   - `[data-toolbar-settings]`       the settings gear (aria-expanded).
 *   - `[data-toolbar-settings-panel]` the settings menu root.
 *   - `[data-toolbar-pin-toggle]`     one menuitemcheckbox per feature (data-pin-id).
 *   - `[data-toolbar-settings-reset]` the restore-defaults button.
 *   - `[data-toolbar-settings-footer]` the GitHub/npm promo area.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { zh } from './locales.ts'
import { TOOLBAR_PIN_IDS, TOOLBAR_PREFS_KEY } from './toolbar-prefs.ts'
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

/** The settings gear button. */
function gearButton(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-toolbar-settings]')
  if (el === null) throw new Error('data-toolbar-settings not found')
  return el
}

function settingsPanel(): HTMLElement | null {
  return document.querySelector('[data-toolbar-settings-panel]')
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
    }
  })
}

/** A settings-menu pin toggle by feature id (menuitemcheckbox). */
function pinToggle(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-toolbar-pin-toggle][data-pin-id="${id}"]`)
  if (el === null) throw new Error(`pin toggle for ${id} not found`)
  return el
}

describe('MilestoneRail collapsible toolbar (B1)', () => {
  it('defaults COLLAPSED: only the expand arrow and the settings gear render', () => {
    renderToolbarRail()

    const expand = expandButton()
    expect(expand).toHaveAttribute('aria-expanded', 'false')
    expect(expand).toHaveAttribute('aria-label', '展开工具栏')

    expect(gearButton()).toHaveAttribute('aria-label', '打开设置')
    expect(gearButton()).toHaveAttribute('aria-expanded', 'false')

    // No function key is rendered while folded (nothing pinned by default).
    expect(featureTogglesPresent()).toEqual([])
    expect(settingsPanel()).toBeNull()
  })

  it('expanding flips aria-expanded and reveals every function key; collapsing tucks them away', () => {
    renderToolbarRail()

    fireEvent.click(expandButton())
    const expand = expandButton()
    expect(expand).toHaveAttribute('aria-expanded', 'true')
    expect(expand).toHaveAttribute('aria-label', '收起工具栏')
    expect(featureTogglesPresent()).toEqual([...TOOLBAR_PIN_IDS])

    // The legacy data attributes survive inside the expanded toolbar.
    expect(document.querySelector('[data-bookmarks-toggle]')).not.toBeNull()
    expect(document.querySelector('[data-focus-toggle]')).not.toBeNull()
    expect(document.querySelector('[data-list-toggle]')).not.toBeNull()
    expect(document.querySelector('[data-session-search-toggle]')).not.toBeNull()
    expect(document.querySelector('[data-search-toggle]')).not.toBeNull()

    fireEvent.click(expand)
    expect(expandButton()).toHaveAttribute('aria-expanded', 'false')
    expect(featureTogglesPresent()).toEqual([])
  })

  it('the settings gear opens the menu; outside pointerdown and re-click close it', () => {
    renderToolbarRail()

    fireEvent.click(gearButton())
    expect(gearButton()).toHaveAttribute('aria-expanded', 'true')
    expect(gearButton()).toHaveAttribute('aria-label', '关闭设置')
    expect(settingsPanel()).not.toBeNull()
    expect(screen.getByText('设置')).not.toBeNull()

    // One menuitemcheckbox per feature, none pinned by default.
    expect(document.querySelectorAll('[data-toolbar-pin-toggle]')).toHaveLength(TOOLBAR_PIN_IDS.length)
    for (const id of TOOLBAR_PIN_IDS) {
      expect(pinToggle(id)).toHaveAttribute('aria-checked', 'false')
    }

    // Outside pointerdown dismisses (shared useOutsideDismiss contract).
    fireEvent.pointerDown(document.body)
    expect(settingsPanel()).toBeNull()
    expect(gearButton()).toHaveAttribute('aria-expanded', 'false')

    // The gear's own click re-opens/closes (kept outside the dismissal hook).
    fireEvent.click(gearButton())
    expect(settingsPanel()).not.toBeNull()
    fireEvent.click(gearButton())
    expect(settingsPanel()).toBeNull()
  })

  it('Escape closes the settings menu and returns focus to the gear', () => {
    renderToolbarRail()

    fireEvent.click(gearButton())
    expect(settingsPanel()).not.toBeNull()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(settingsPanel()).toBeNull()
    expect(document.activeElement).toBe(gearButton())
  })

  it('pinning a feature in settings keeps it visible while collapsed and persists the blob', () => {
    const { backing } = renderToolbarRail()

    fireEvent.click(gearButton())
    const toggle = pinToggle('bookmarks')
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    // UI change writes through immediately (canonical order, sanitized).
    expect(backing.get(TOOLBAR_PREFS_KEY)).toBe(JSON.stringify({ pinned: ['bookmarks'] }))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(settingsPanel()).toBeNull()

    // Collapsed but the pinned feature stays: only bookmarks is visible.
    expect(featureTogglesPresent()).toEqual(['bookmarks'])
    expect(expandButton()).toHaveAttribute('aria-expanded', 'false')

    // The settings menu reflects the persisted pin when reopened.
    fireEvent.click(gearButton())
    expect(pinToggle('bookmarks')).toHaveAttribute('aria-checked', 'true')
    expect(pinToggle('focus')).toHaveAttribute('aria-checked', 'false')
  })

  it('mount-time hydration: a pre-seeded pinned blob renders those features while collapsed', () => {
    renderToolbarRail(USERS, {
      prefs: JSON.stringify({ pinned: ['search', 'focus'] }),
    })

    expect(expandButton()).toHaveAttribute('aria-expanded', 'false')
    expect(featureTogglesPresent()).toEqual(['search', 'focus'])
    // The whole RailSearchUi renders pinned-collapsed — its toggle is there.
    expect(document.querySelector('[data-search-toggle]')).not.toBeNull()

    // The in-rail search panel still opens from the pinned toggle.
    fireEvent.click(document.querySelector('[data-search-toggle]')!)
    expect(document.querySelector('[data-rail-search]')).not.toBeNull()
  })

  it('mount-time hydration sanitizes the blob: unknown ids never render', () => {
    renderToolbarRail(USERS, {
      prefs: JSON.stringify({ pinned: ['ghost', 'list', 'ghost'] }),
    })

    expect(featureTogglesPresent()).toEqual(['list'])
  })

  it('reset clears every pin and persists the empty set', () => {
    const { backing } = renderToolbarRail(USERS, {
      prefs: JSON.stringify({ pinned: ['bookmarks', 'focus'] }),
    })
    expect(featureTogglesPresent()).toEqual(['bookmarks', 'focus'])

    fireEvent.click(gearButton())
    fireEvent.click(document.querySelector<HTMLElement>('[data-toolbar-settings-reset]')!)

    // Every checkbox unchecks and the blob is cleared.
    for (const id of TOOLBAR_PIN_IDS) {
      expect(pinToggle(id)).toHaveAttribute('aria-checked', 'false')
    }
    expect(backing.get(TOOLBAR_PREFS_KEY)).toBe(JSON.stringify({ pinned: [] }))

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(featureTogglesPresent()).toEqual([])
  })

  it('the footer links to the GitHub repo, issues page, and npm channel with _blank+noreferrer', () => {
    renderToolbarRail()

    fireEvent.click(gearButton())

    const footer = document.querySelector('[data-toolbar-settings-footer]')
    expect(footer).not.toBeNull()
    expect(footer?.textContent).toContain('支持我们')

    const links = [...footer!.querySelectorAll<HTMLAnchorElement>('a')]
    const hrefs = links.map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual([
      PLUGIN_REPO_URL,
      PLUGIN_REPO_URL,
      `${PLUGIN_REPO_URL}/issues`,
      PLUGIN_NPM_URL,
    ])
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noreferrer')
    }
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