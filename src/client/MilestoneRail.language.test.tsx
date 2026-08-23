/**
 * Component tests for the settings LANGUAGE switch (0.6.2): the rail copy
 * follows the harness `t` seat by default ('system'), or is forced to the
 * plugin's own zh/en dictionaries via the toolbar prefs `locale` field.
 *
 * Render helpers mirror MilestoneRail.settings.test.tsx (renderRail.tsx is
 * owned by an earlier phase — untouched).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { en, zh } from './locales.ts'
import { DEFAULT_PREFS, TOOLBAR_PREFS_KEY } from './toolbar-prefs.ts'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'
import { buildSnapshot } from '../test/snapshot-fixture.ts'
import type { RailUser } from '../test/renderRail.tsx'

const USERS: RailUser[] = [
  { key: '13:user<lg-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<lg-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Same module-level dictionary interpreter as renderRail (the "harness t seat"). */
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
 * Render the rail with a selectable harness-locale t seat (default zh, like
 * the production harness in a Chinese browser) and an optional pre-seeded
 * toolbar blob.
 */
function renderLanguageRail(opts?: { harnessDict?: Record<string, string>; prefs?: string }) {
  const snapshot = buildSnapshot({ users: USERS })
  const useSession = (selector: (snap: ConversationSnapshotFixture) => unknown) => selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const useProjection = () => undefined
  const t = makeT(opts?.harnessDict ?? (zh as Record<string, string>))
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

function openSettings() {
  const expand = expandButton()
  if (expand.getAttribute('aria-expanded') !== 'true') fireEvent.click(expand)
  if (settingsPanel() === null) fireEvent.click(gearButton())
}

describe('MilestoneRail language switch (0.6.2)', () => {
  it('locale=system (default) follows the harness t seat — Chinese copy with a zh seat', () => {
    renderLanguageRail()

    expect(document.querySelector('[aria-label="会话里程碑"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="Search messages"]')).toBeNull()

    // The toolbar copy stays Chinese too.
    const expand = expandButton()
    fireEvent.click(expand)
    expect(document.querySelector('[aria-label="搜索消息"]')).not.toBeNull()
  })

  it('locale=en forces the plugin English dictionary, independent of the harness seat', () => {
    // The harness seat here is ZH, but the pref forces English — the override
    // must win and re-render every chrome string.
    renderLanguageRail({ prefs: JSON.stringify({ ...DEFAULT_PREFS, locale: 'en' }) })

    expect(document.querySelector('[aria-label="Session milestones"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="会话里程碑"]')).toBeNull()

    fireEvent.click(expandButton())
    expect(document.querySelector('[aria-label="Search messages"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="搜索消息"]')).toBeNull()
  })

  it('locale=zh keeps Chinese even when the harness seat is English', () => {
    renderLanguageRail({
      harnessDict: en as Record<string, string>,
      prefs: JSON.stringify({ ...DEFAULT_PREFS, locale: 'zh' }),
    })

    expect(document.querySelector('[aria-label="会话里程碑"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="Session milestones"]')).toBeNull()
  })

  it('the settings modal exposes the language section; choosing English flips the copy and persists', () => {
    const { backing } = renderLanguageRail()
    openSettings()

    // Section + radiogroup present, defaulting to 跟随系统.
    expect(document.querySelector('[data-settings-lang]')).not.toBeNull()
    const checked = document.querySelector<HTMLInputElement>('[data-locale-pref]:checked')!
    expect(checked.value).toBe('system')

    fireEvent.click(document.querySelector<HTMLInputElement>('[data-locale-pref][value="en"]')!)

    // Copy flips immediately and the blob persisted.
    expect(document.querySelector('[aria-label="Session milestones"]')).not.toBeNull()
    const stored = JSON.parse(backing.get(TOOLBAR_PREFS_KEY)!)
    expect(stored.locale).toBe('en')

    // Radio reflects the new selection.
    expect(
      (document.querySelector<HTMLInputElement>('[data-locale-pref][value="en"]')!).checked,
    ).toBe(true)
  })

  it('choosing 跟随系统 (system) releases the override and follows the harness seat again', () => {
    renderLanguageRail({ prefs: JSON.stringify({ ...DEFAULT_PREFS, locale: 'en' }) })
    openSettings()

    fireEvent.click(document.querySelector<HTMLInputElement>('[data-locale-pref][value="system"]')!)

    expect(document.querySelector('[aria-label="会话里程碑"]')).not.toBeNull()
    const stored = JSON.parse(
      (vi.mocked(localStorage).getItem(TOOLBAR_PREFS_KEY) as string) ?? '{}',
    )
    expect(stored.locale).toBe('system')
  })
})