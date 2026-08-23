/**
 * Component tests for the milestone rail's in-rail search (F1):
 * toggle, full-text matching beyond the 80-char preview, dimming of
 * non-matches, Enter navigation with wrap-around, Escape reset, and
 * outside-pointer dismissal (a pointerdown outside the open panel closes it;
 * one inside keeps it open).
 *
 * The fixture message whose text exceeds 80 chars proves the search runs over
 * the FULL message text (`text`, from `rail-logic.extractText`) — a token
 * placed after character 80 can never be found by a search over the truncated
 * hover preview (`preview`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen } from '@testing-library/react'
import { renderRail as renderRailImpl } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** 3 users; the third carries a unique token only present AFTER char 80. */
const USERS: RailUser[] = [
  { key: '13:user<search-1>', seq: 1, time: 1_700_000_000_000, text: '第一个问题：如何优化构建速度' },
  { key: '13:user<search-2>', seq: 2, time: 1_700_000_060_000, text: '第二个问题：如何减少内存占用' },
  { key: '13:user<search-3>', seq: 3, time: 1_700_000_120_000, text: 'x'.repeat(80) + ' TAILNEEDLE-zq7k' },
]

const TOKEN = 'TAILNEEDLE-zq7k'

/** Same shape, but the first and third messages share the word 'alpha'. */
const USERS_ALPHA: RailUser[] = [
  { key: '13:user<a-1>', seq: 1, time: 1_700_000_000_000, text: 'alpha first question' },
  { key: '13:user<a-2>', seq: 2, time: 1_700_000_060_000, text: 'unrelated middle message' },
  { key: '13:user<a-3>', seq: 3, time: 1_700_000_120_000, text: 'alpha final question with tail' },
]

function render(users: RailUser[] = USERS) {
  return renderRailImpl(users)
}

/** B1: the toolbar defaults COLLAPSED — expand it to reveal the search toggle. */
function expandToolbar() {
  const btn = document.querySelector<HTMLElement>('[data-toolbar-expand]')
  if (btn === null) throw new Error('data-toolbar-expand not found')
  fireEvent.click(btn)
}

function toggle() {
  return screen.getByRole('button', { name: '搜索消息' })
}

function dot(n: number) {
  return screen.getByRole('button', { name: `跳转到第 ${n} 条消息` })
}

function matchCount(): HTMLElement {
  const el = document.querySelector('[data-match-count]')
  if (el === null) throw new Error('data-match-count not found')
  return el as HTMLElement
}

function searchInput(): HTMLInputElement {
  const el = document.querySelector('[data-rail-search]')
  if (el === null) throw new Error('data-rail-search not found')
  return el as HTMLInputElement
}

describe('MilestoneRail search (F1)', () => {
  it('the rail shows a search toggle; clicking it reveals input and match counter', () => {
    render()
    expandToolbar()

    expect(toggle()).toBeInTheDocument()
    expect(document.querySelector('[data-rail-search]')).toBeNull()

    fireEvent.click(toggle())

    expect(document.querySelector('[data-rail-search]')).not.toBeNull()
    expect(document.querySelector('[data-match-count]')).not.toBeNull()
  })

  it('matches a phrase that appears only after character 80: 1/3, match dot lit, others dimmed', () => {
    const tailIndex = USERS[2].text.indexOf(TOKEN)
    // Guard: the fixture really puts the token beyond the 80-char preview cut.
    expect(tailIndex).toBeGreaterThan(80)

    render()
    expandToolbar()
    fireEvent.click(toggle())
    fireEvent.change(searchInput(), { target: { value: TOKEN } })

    expect(matchCount().textContent).toBe('1/3')
    // The full-text match (third dot) keeps full styling; the other two dim.
    expect(dot(3)).not.toHaveAttribute('data-dimmed')
    expect(dot(1)).toHaveAttribute('data-dimmed')
    expect(dot(2)).toHaveAttribute('data-dimmed')
  })

  it('Enter advances the active match to the next dot and wraps around', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')

    render(USERS_ALPHA)
    expandToolbar()
    fireEvent.click(toggle())
    fireEvent.change(searchInput(), { target: { value: 'alpha' } })

    // Two matches (dots 1 and 3); first match is active initially.
    expect(matchCount().textContent).toBe('2/3')
    expect(dot(1)).toHaveAttribute('aria-current', 'true')
    expect(dot(3)).not.toHaveAttribute('aria-current')

    // Enter: advance to the second match and jump to its anchor row.
    fireEvent.keyDown(searchInput(), { key: 'Enter' })
    expect(dot(3)).toHaveAttribute('aria-current', 'true')
    expect(dot(1)).not.toHaveAttribute('aria-current')
    const lastJump = spy.mock.instances.at(-1) as HTMLElement | undefined
    expect(lastJump?.dataset.chatAnchorKey).toBe(USERS_ALPHA[2].key)

    // Enter again: wrap back to the first match.
    fireEvent.keyDown(searchInput(), { key: 'Enter' })
    expect(dot(1)).toHaveAttribute('aria-current', 'true')
    expect(dot(3)).not.toHaveAttribute('aria-current')
  })

  it('Escape clears the query, closes the panel, and restores every dot', () => {
    render()
    expandToolbar()
    fireEvent.click(toggle())
    fireEvent.change(searchInput(), { target: { value: TOKEN } })
    expect(dot(1)).toHaveAttribute('data-dimmed')

    fireEvent.keyDown(searchInput(), { key: 'Escape' })

    expect(document.querySelector('[data-rail-search]')).toBeNull()
    expect(dot(1)).not.toHaveAttribute('data-dimmed')
    expect(dot(2)).not.toHaveAttribute('data-dimmed')
    expect(dot(3)).not.toHaveAttribute('data-dimmed')

    // Reopening shows a cleared query.
    fireEvent.click(toggle())
    expect(searchInput().value).toBe('')
    expect(matchCount().textContent).toBe('3/3')
  })

  it('a pointerdown outside the panel closes it', () => {
    render()
    expandToolbar()
    fireEvent.click(toggle())
    expect(document.querySelector('[data-rail-search]')).not.toBeNull()

    fireEvent.pointerDown(document.body)

    expect(document.querySelector('[data-rail-search]')).toBeNull()
  })

  it('a pointerdown inside the panel keeps it open', () => {
    render()
    expandToolbar()
    fireEvent.click(toggle())
    fireEvent.pointerDown(searchInput())

    expect(document.querySelector('[data-rail-search]')).not.toBeNull()
  })
})
