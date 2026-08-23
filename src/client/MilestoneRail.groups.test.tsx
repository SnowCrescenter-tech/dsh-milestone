/**
 * RED component tests for turn grouping (C4): the rail partitions consecutive
 * dots by turn with a thin `data-turn-separator` line at each turn boundary,
 * and a per-turn collapse action in the hover tooltip folds a turn down to its
 * LAST mark (a `data-collapsed-summary` dot carrying `data-collapsed-count`).
 *
 * The feature is NOT implemented yet — MilestoneRail renders `displayMarks`
 * flat with no separators, no collapsed-turn state, and the tooltip has no
 * `data-toggle-collapse` action. These tests pin the data contract the
 * implementation WILL ship, so they fail now for the right reason (missing
 * `data-turn-separator` / `data-toggle-collapse` / `data-collapsed-summary`)
 * and turn green once the grouping lands:
 *
 *   - fixture `userTurns: [1, 1, 2]` (3 users) yields exactly ONE separator,
 *     sitting between dot 2 and dot 3 (the turn 1→2 boundary), with
 *     `data-turn="2"` (the turn the boundary leads INTO).
 *   - the tooltip on a turn-1 dot offers `data-toggle-collapse` (label
 *     折叠此轮, `aria-pressed=false`); clicking folds turn 1 to a single
 *     summary dot (`data-collapsed-summary="true"`,
 *     `data-collapsed-count="2"`) while the turn-2 dot stays; the toggle now
 *     reads 展开此轮 (`aria-pressed=true`) and clicking again restores all
 *     three dots.
 *   - search totals are unaffected by collapse: the N/M counter keeps the
 *     full displayMarks count (3/3) while only 2 dots are rendered.
 *
 * The tooltip-toggle assertions need `userTurns` in the fixture, so this file
 * mirrors the MilestoneRail.tooltip.test.tsx scaffold (renderTooltip with a
 * local renderGroups helper) instead of the plain renderRail helper.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { zh } from './locales.ts'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'
import { buildSnapshot } from '../test/snapshot-fixture.ts'

/** Locale interpreter mirroring renderRail's: dictionary lookup with `{name}` slot substitution. */
function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    const tpl = dict[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot)) : tpl
  }
}

/** Full Storage surface (getItem/setItem/removeItem/clear/key/length) over a Map. */
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

interface GroupUser {
  key: string
  seq: number
  time: number
  text: string
}

interface RenderGroupsOptions {
  users: GroupUser[]
  userTurns: number[]
}

/**
 * Render the rail over a snapshot whose user nodes carry explicit turns —
 * the same scaffold as renderTooltip, feeding `userTurns` into buildSnapshot
 * so `location.turn.turn` (and hence the turn grouping) is real.
 */
function renderGroups(opts: RenderGroupsOptions) {
  const snapshot = buildSnapshot({ users: opts.users, userTurns: opts.userTurns })
  const useSession: (selector: (s: ConversationSnapshotFixture) => unknown) => unknown = (selector) =>
    selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const forkAt = vi.fn(async () => 'child-id')

  const backing = new Map<string, string>()
  vi.stubGlobal('localStorage', createStorage(backing))
  const store = createBookmarksStore().create('fixture')

  const props = {
    useSession,
    sessionId: 'fixture',
    useProjection: () => undefined,
    loadOlder,
    useStore: (selector: (s: { keys: string[] }) => unknown) => selector(store.getSnapshot()),
    actions: store.actions,
    t: makeT(zh as Record<string, string>),
    forkAt,
  } as unknown as MilestoneRailProps

  const result = render(
    <div data-conversation-scroll>
      <div style={{ height: 400 }}>
        {opts.users.map((user) => (
          <div key={user.key} data-chat-anchor-key={user.key} style={{ height: 48 }}>
            {user.text}
          </div>
        ))}
      </div>
      <MilestoneRail {...props} />
    </div>,
  )

  return { ...result, snapshot }
}

/** 3 users whose turns are 1, 1, 2 — one boundary, before the third dot. */
const USERS: GroupUser[] = [
  { key: '13:user<g-1>', seq: 1, time: 1_700_000_000_000, text: '第一条消息' },
  { key: '13:user<g-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
  { key: '13:user<g-3>', seq: 3, time: 1_700_000_120_000, text: '第三条消息' },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** The dots scroll container. */
function list(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-rail-list]')
  if (el === null) throw new Error('[data-rail-list] not found')
  return el
}

/** Every rendered dot button, in DOM order. */
function dots(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-rail-dot]')]
}

/** Every turn separator, in DOM order. */
function separators(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-turn-separator]')]
}

/** The nth dot, by its accessible name (index 1 = the FIRST mark). */
function dot(n: number): HTMLElement {
  return screen.getByRole('button', { name: `跳转到第 ${n} 条消息` })
}

/** The tooltip's collapse/expand action button; throws while the feature is unimplemented. */
function toggleCollapse(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-toggle-collapse]')
  if (el === null) throw new Error('[data-toggle-collapse] not found (collapse action not implemented)')
  return el
}

/** The search N/M counter span. */
function matchCount(): HTMLElement {
  const el = document.querySelector<HTMLElement>('[data-match-count]')
  if (el === null) throw new Error('data-match-count not found')
  return el
}

/** The search input (the search toggle must be opened first). */
function searchInput(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('[data-rail-search]')
  if (el === null) throw new Error('data-rail-search not found')
  return el
}

describe('MilestoneRail turn grouping (C4)', () => {
  it('renders ONE separator at the turn 1→2 boundary, between dot 2 and dot 3, with data-turn="2"', () => {
    renderGroups({ users: USERS, userTurns: [1, 1, 2] })

    expect(dots()).toHaveLength(3)
    expect(separators()).toHaveLength(1)

    // DOM order inside the list: dot, dot, separator, dot — the separator
    // sits exactly at the turn 1→2 boundary, before the third mark.
    const children = [...list().children]
    expect(children[0]).toHaveAttribute('data-rail-dot')
    expect(children[1]).toHaveAttribute('data-rail-dot')
    expect(children[2]).toHaveAttribute('data-turn-separator')
    expect(children[2]).toHaveAttribute('data-turn', '2')
    expect(children[3]).toHaveAttribute('data-rail-dot')
    expect(children[3]).toBe(dot(3))
  })

  it('the tooltip collapse action folds turn 1 to its last mark as a summary dot, and toggles back', () => {
    renderGroups({ users: USERS, userTurns: [1, 1, 2] })

    // Hover a turn-1 dot: two marks share turn 1, so the collapse action shows.
    fireEvent.mouseEnter(dot(1))
    const toggle = toggleCollapse()
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle.textContent).toBe('折叠此轮')

    fireEvent.click(toggle)

    // Turn 1 folds to its LAST mark: 2 dots remain; the turn-1 dot is the
    // collapsed summary; the turn-2 dot is untouched.
    expect(dots()).toHaveLength(2)
    const summary = dot(2)
    expect(summary).toHaveAttribute('data-collapsed-summary', 'true')
    expect(summary).toHaveAttribute('data-collapsed-count', '2')
    expect(dot(3)).toBeInTheDocument()
    expect(dot(3)).not.toHaveAttribute('data-collapsed-summary')
    // The turn boundary separator is still there (summary → turn 2).
    expect(separators()).toHaveLength(1)
    expect(separators()[0]).toHaveAttribute('data-turn', '2')

    // The tooltip now offers the expand action for the collapsed turn.
    fireEvent.mouseEnter(summary)
    const expand = toggleCollapse()
    expect(expand).toHaveAttribute('aria-pressed', 'true')
    expect(expand.textContent).toBe('展开此轮')

    fireEvent.click(expand)

    // Expanding restores every dot; no summary remains.
    expect(dots()).toHaveLength(3)
    expect(document.querySelectorAll('[data-collapsed-summary]')).toHaveLength(0)
  })

  it('search N/M total keeps the full mark count while a turn is collapsed', () => {
    renderGroups({ users: USERS, userTurns: [1, 1, 2] })

    // B1: the toolbar defaults COLLAPSED — expand it to reveal the search toggle.
    fireEvent.click(screen.getByRole('button', { name: '展开工具栏' }))
    // Every fixture message contains '条': 3/3 matches.
    fireEvent.click(screen.getByRole('button', { name: '搜索消息' }))
    fireEvent.change(searchInput(), { target: { value: '条' } })
    expect(matchCount().textContent).toBe('3/3')

    // Collapsing turn 1 shrinks the rendered dots but not the search corpus.
    fireEvent.mouseEnter(dot(1))
    fireEvent.click(toggleCollapse())
    expect(dots()).toHaveLength(2)
    expect(matchCount().textContent).toBe('3/3')
  })
})
