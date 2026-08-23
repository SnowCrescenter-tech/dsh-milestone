/**
 * Component tests for the B4 update-check toolbar feature:
 *   - mount-time SILENT check, delayed ~1.5s, served by a 6h localStorage
 *     cache (unexpired cache → no network traffic at all)
 *   - availability badge (`data-update-available`) when the registry/cached
 *     latest is newer than the installed version; absent when up to date
 *   - the detail popover (current / latest + source / conclusion / host
 *     lines), dismissed by outside pointerdown or Escape with focus returned
 *     to the toggle
 *   - the manual "检查更新" button: disabled with "检查中…" in flight, fires a
 *     fresh request, and updates the conclusion
 *   - failure state with error detail and a retry action
 *
 * The render helper mirrors MilestoneRail.toolbar.test.tsx's (renderRail.tsx
 * is owned by an earlier phase — untouched): it seeds the toolbar prefs blob
 * so the update key stays visible while the toolbar is collapsed, plus an
 * optional `dsh-milestone.update-cache` blob. Timers are faked per test so
 * the 1.5s mount check is driven deterministically.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { zh } from './locales.ts'
import { TOOLBAR_PREFS_KEY } from './toolbar-prefs.ts'
import { UPDATE_CACHE_KEY, UPDATE_CACHE_TTL_MS } from './version-logic.ts'
import { PLUGIN_NPM_URL, PLUGIN_VERSION } from './version-meta.ts'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'
import { buildSnapshot } from '../test/snapshot-fixture.ts'
import type { RailUser } from '../test/renderRail.tsx'

const USERS: RailUser[] = [
  { key: '13:user<upd-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<upd-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

/** The mount-check delay the rail uses. */
const MOUNT_CHECK_DELAY = 1500

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

/** Minimal Response-like object; version-logic only reads ok + json(). */
const okJson = (data: unknown): unknown => ({ ok: true, status: 200, json: async () => data })

/** Minimal non-ok Response-like object (HTTP failure). */
const httpError = (status: number): unknown => ({ ok: false, status, json: async () => ({}) })

/** Fetch stub returning the npmmirror dist-tags shape for any URL. */
function npmmirrorLatest(latest: string) {
  return async (_url: string) => okJson({ latest, next: '0.0.0-beta.1' })
}

/**
 * Render the rail with the update key PINNED (visible while the toolbar is
 * collapsed) plus an optional pre-seeded update-cache blob. `prefs` overrides
 * the default updateCheck pin (e.g. `{pinned: []}` for the collapsed test).
 */
function renderUpdateRail(opts?: { prefs?: string; cache?: string }) {
  const snapshot = buildSnapshot({ users: USERS })
  const useSession = (selector: (snap: ConversationSnapshotFixture) => unknown) => selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const useProjection = () => undefined
  const t = makeT(zh as Record<string, string>)
  const forkAt = vi.fn(async () => 'child-id')

  const backing = new Map<string, string>()
  backing.set(TOOLBAR_PREFS_KEY, opts?.prefs ?? JSON.stringify({ pinned: ['updateCheck'] }))
  if (opts?.cache !== undefined) backing.set(UPDATE_CACHE_KEY, opts.cache)
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

/** Fire the mount-time silent check (advances past the 1.5s delay). */
async function runMountCheck(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(MOUNT_CHECK_DELAY)
  })
}

/** Flush pending microtasks (resolved fetch stubs) inside act. */
async function flush(): Promise<void> {
  await act(async () => {})
}

/** The update-check toggle button. */
function updateButton(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-update-check]')
  if (el === null) throw new Error('data-update-check not found')
  return el
}

/** The update detail popover root (null while closed). */
function updatePanel(): HTMLElement | null {
  return document.querySelector('[data-update-panel]')
}

/** The availability badge dot (null while absent). */
function updateBadge(): HTMLElement | null {
  return document.querySelector('[data-update-available]')
}

describe('MilestoneRail update-check (B4)', () => {
  it('mount: an unexpired cache entry is reused — NO request, badge from the cached latest', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const cache = JSON.stringify({ latest: '9.9.9', source: 'npm', checkedAt: Date.now() })
    renderUpdateRail({ cache })

    expect(updateBadge()).toBeNull()

    await runMountCheck()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(updateBadge()).not.toBeNull()
  })

  it('mount: an expired cache triggers a registry request (npmmirror shape); newer latest lights the badge and refreshes the blob', async () => {
    const fetchMock = vi.fn(npmmirrorLatest('0.9.0'))
    vi.stubGlobal('fetch', fetchMock)
    const stale = JSON.stringify({ latest: '0.0.1', source: 'npm', checkedAt: Date.now() - UPDATE_CACHE_TTL_MS - 1000 })
    const { backing } = renderUpdateRail({ cache: stale })

    await runMountCheck()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('npmmirror')
    expect(updateBadge()).not.toBeNull()
    // The fresh result replaced the stale blob (checkedAt refreshed).
    const stored = JSON.parse(backing.get(UPDATE_CACHE_KEY)!) as { latest: string; source: string }
    expect(stored.latest).toBe('0.9.0')
    expect(stored.source).toBe('npmmirror')
  })

  it('mount: a registry latest NOT newer than installed shows no badge; the popover reports 已是最新版本', async () => {
    vi.stubGlobal('fetch', vi.fn(npmmirrorLatest('0.0.0-dev')))
    renderUpdateRail()

    await runMountCheck()

    expect(updateBadge()).toBeNull()

    fireEvent.click(updateButton())
    const panel = updatePanel()
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain('已是最新版本')
    expect(panel!.querySelector('a')).toBeNull()
  })

  it('the popover shows current/latest/source/conclusion/host lines; outside pointerdown and Escape close it with focus back on the toggle', async () => {
    vi.stubGlobal('fetch', vi.fn(npmmirrorLatest('9.9.9')))
    renderUpdateRail()
    await runMountCheck()

    fireEvent.click(updateButton())
    const panel = updatePanel()
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain('更新检测')
    expect(panel!.textContent).toContain('当前版本')
    expect(panel!.textContent).toContain(PLUGIN_VERSION)
    expect(panel!.textContent).toContain('最新版本')
    expect(panel!.textContent).toContain('9.9.9')
    expect(panel!.textContent).toContain('(npmmirror)')
    expect(panel!.textContent).toContain('发现新版本 v9.9.9')
    expect(panel!.textContent).toContain('去 npm 升级')
    expect(panel!.textContent).toContain('rc.2 line')

    const npmLink = panel!.querySelector<HTMLAnchorElement>('a')
    expect(npmLink).not.toBeNull()
    expect(npmLink!.getAttribute('href')).toBe(PLUGIN_NPM_URL)
    expect(npmLink!).toHaveAttribute('target', '_blank')
    expect(npmLink!).toHaveAttribute('rel', 'noreferrer')

    // Outside pointerdown dismisses (shared useOutsideDismiss contract).
    fireEvent.pointerDown(document.body)
    expect(updatePanel()).toBeNull()

    // Re-open; Escape dismisses and returns focus to the toggle.
    fireEvent.click(updateButton())
    expect(updatePanel()).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(updatePanel()).toBeNull()
    expect(document.activeElement).toBe(updateButton())
  })

  it('the manual check button fires a NEW request, disables with 检查中… in flight, and updates the conclusion', async () => {
    let resolveFetch: ((value: unknown) => void) | null = null
    const fetchMock = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    renderUpdateRail()

    fireEvent.click(updateButton())
    const manual = updatePanel()!.querySelector<HTMLButtonElement>('[data-update-manual]')!
    fireEvent.click(manual)

    // In flight: disabled + 检查中…, and the registry was hit once.
    expect(manual).toBeDisabled()
    expect(manual.textContent).toBe('检查中…')
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFetch!(okJson({ latest: '0.9.0' }))
    })
    expect(manual).not.toBeDisabled()
    expect(updatePanel()!.textContent).toContain('发现新版本 v0.9.0')
    expect(updatePanel()!.textContent).toContain('去 npm 升级')

    // The successful check wrote a fresh 6h cache, so a re-click within the
    // TTL reuses it: no second request, same conclusion.
    fireEvent.click(manual)
    expect(manual).toBeDisabled()
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(updatePanel()!.textContent).toContain('发现新版本 v0.9.0')

    // Once the cache expires, a manual check re-queries and picks up a newer
    // registry answer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(UPDATE_CACHE_TTL_MS + 1)
    })
    fireEvent.click(manual)
    expect(manual).toBeDisabled()
    await act(async () => {
      resolveFetch!(okJson({ latest: '0.9.1' }))
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(updatePanel()!.textContent).toContain('发现新版本 v0.9.1')
  })

  it('a failed check shows 检查失败 with the error; the retry action recovers and updates the conclusion', async () => {
    const fetchMock = vi.fn(async (_url: string) => httpError(500))
    vi.stubGlobal('fetch', fetchMock)
    renderUpdateRail()

    await runMountCheck()
    expect(fetchMock).toHaveBeenCalledTimes(2) // npmmirror + npm fallback, both failed

    fireEvent.click(updateButton())
    const failed = updatePanel()!.querySelector('[data-update-failed]')
    expect(failed).not.toBeNull()
    expect(failed!.textContent).toContain('检查失败')
    expect(failed!.textContent).toMatch(/npmmirror/)

    // Retry: the registry now answers.
    fetchMock.mockImplementation(npmmirrorLatest('9.9.9'))
    fireEvent.click(updatePanel()!.querySelector<HTMLButtonElement>('[data-update-retry]')!)
    await flush()

    expect(updatePanel()!.querySelector('[data-update-failed]')).toBeNull()
    expect(updatePanel()!.textContent).toContain('9.9.9')
    expect(updatePanel()!.textContent).toContain('发现新版本')
    expect(updateBadge()).not.toBeNull()
  })

  it('collapsed by default: the update button is absent until the toolbar expands (or the key is pinned)', async () => {
    renderUpdateRail({ prefs: JSON.stringify({ pinned: [] }) })

    expect(document.querySelector('[data-update-check]')).toBeNull()

    const expand = document.querySelector<HTMLElement>('[data-toolbar-expand]')!
    fireEvent.click(expand)
    expect(document.querySelector('[data-update-check]')).not.toBeNull()
  })
})