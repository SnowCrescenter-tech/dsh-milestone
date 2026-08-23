/**
 * Unit tests for toolbar-prefs: the sanitize/persist layer behind the
 * collapsible toolbar's "pinned outside the collapse" preferences.
 *
 * Contract under test:
 *   - `parsePrefs` degrades to `[]` for null / invalid JSON / wrong shapes
 *     and sanitizes real blobs (whitelist ids only, duplicates dropped,
 *     unknown ids discarded, canonical order preserved)
 *   - `togglePin` flips membership purely and never admits an unknown id
 *   - `savePrefs`/`loadPrefs` round-trip through localStorage (jsdom's real
 *     storage — the rail ships in a browser, so no stub needed here)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TOOLBAR_PIN_IDS,
  TOOLBAR_PREFS_KEY,
  isToolbarPinId,
  loadPrefs,
  parsePrefs,
  savePrefs,
  togglePin,
} from './toolbar-prefs.ts'
import type { ToolbarPinId } from './toolbar-prefs.ts'

const KEY = TOOLBAR_PREFS_KEY

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('toolbar-prefs parsePrefs', () => {
  it('null (nothing stored) and empty storage yield the empty default', () => {
    expect(parsePrefs(null)).toEqual([])
    expect(parsePrefs(undefined as unknown as string)).toEqual([])
  })

  it('invalid JSON degrades to the empty default', () => {
    expect(parsePrefs('not json at all')).toEqual([])
    expect(parsePrefs('{"pinned": [}')).toEqual([])
  })

  it('a non-object or a blob without a pinned array degrades to the empty default', () => {
    expect(parsePrefs('42')).toEqual([])
    expect(parsePrefs('"search"')).toEqual([])
    expect(parsePrefs('{}')).toEqual([])
    expect(parsePrefs('{"pinned": "search"}')).toEqual([])
    expect(parsePrefs('{"keys": ["search"]}')).toEqual([])
  })

  it('drops unknown ids and keeps only whitelist members', () => {
    expect(parsePrefs(JSON.stringify({ pinned: ['search', 'updateCheck', 'bookmarks', 'nope'] }))).toEqual([
      'search',
      'updateCheck',
      'bookmarks',
    ])
  })

  it('dedupes repeated ids and preserves the first-seen (pin) order', () => {
    expect(parsePrefs(JSON.stringify({ pinned: ['focus', 'search', 'focus', 'list'] }))).toEqual([
      'focus',
      'search',
      'list',
    ])
  })

  it('ignores non-string entries', () => {
    expect(parsePrefs(JSON.stringify({ pinned: ['bookmarks', 7, null, false] }))).toEqual(['bookmarks'])
  })

  it('whitelist sanity: every exported id is a valid toolbar pin id', () => {
    for (const id of TOOLBAR_PIN_IDS) {
      expect(isToolbarPinId(id)).toBe(true)
    }
    expect(isToolbarPinId('ghost')).toBe(false)
  })
})

describe('toolbar-prefs togglePin', () => {
  it('adds an absent id and removes a present one', () => {
    expect(togglePin([], 'bookmarks')).toEqual(['bookmarks'])
    expect(togglePin(['bookmarks', 'focus'], 'bookmarks')).toEqual(['focus'])
  })

  it('is pure: never mutates the input array', () => {
    const input: ToolbarPinId[] = ['list']
    const output = togglePin(input, 'search')
    expect(input).toEqual(['list'])
    expect(output).toEqual(['list', 'search'])
  })

  it('ignores unknown ids and returns a copy', () => {
    const input: ToolbarPinId[] = ['bookmarks']
    expect(togglePin(input, 'ghost')).toEqual(['bookmarks'])
    expect(togglePin(input, 'ghost')).not.toBe(input)
  })

  it('dedupes when the input already contains repeats', () => {
    expect(togglePin(['search', 'search'], 'focus')).toEqual(['search', 'focus'])
  })
})

describe('toolbar-prefs localStorage round-trip', () => {
  it('loadPrefs returns [] when nothing is stored', () => {
    expect(loadPrefs()).toEqual([])
  })

  it('savePrefs + loadPrefs round-trip the pinned set (jsdom localStorage)', () => {
    savePrefs(['bookmarks', 'search'])
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify({ pinned: ['bookmarks', 'search'] }))
    expect(loadPrefs()).toEqual(['bookmarks', 'search'])
  })

  it('savePrefs writes the sanitized form (unknown/duplicate ids never persist)', () => {
    savePrefs(['bookmarks', 'ghost', 'bookmarks'])
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify({ pinned: ['bookmarks'] }))
  })

  it('savePrefs([]) persists the empty pin set (reset)', () => {
    savePrefs(['focus'])
    savePrefs([])
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify({ pinned: [] }))
    expect(loadPrefs()).toEqual([])
  })

  it('loadPrefs sanitizes a hand-edited blob instead of throwing', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ pinned: ['search', 'unknown', 'search'] }))
    expect(loadPrefs()).toEqual(['search'])
    window.localStorage.setItem(KEY, '{broken')
    expect(loadPrefs()).toEqual([])
  })
})