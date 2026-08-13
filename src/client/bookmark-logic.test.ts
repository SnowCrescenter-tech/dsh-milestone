/**
 * Unit tests for the pure bookmark-logic module: membership, immutable
 * append/remove toggling, bookmark filtering of a mark list, and count.
 * No React, no DOM.
 */
import { describe, it, expect } from 'vitest'
import { bookmarkCount, filterByBookmarks, isBookmarked, toggleKey } from './bookmark-logic'

describe('isBookmarked', () => {
  it('is true when the key is present in the list', () => {
    expect(isBookmarked(['a', 'b', 'c'], 'b')).toBe(true)
    expect(isBookmarked(['a'], 'a')).toBe(true)
  })

  it('is false when the key is absent from the list', () => {
    expect(isBookmarked(['a', 'b'], 'z')).toBe(false)
  })

  it('is false for an empty list', () => {
    expect(isBookmarked([], 'a')).toBe(false)
  })
})

describe('toggleKey', () => {
  it('appends a key that is not bookmarked', () => {
    expect(toggleKey(['a', 'b'], 'c')).toEqual(['a', 'b', 'c'])
    expect(toggleKey([], 'x')).toEqual(['x'])
  })

  it('removes a key that is bookmarked', () => {
    expect(toggleKey(['a', 'b'], 'a')).toEqual(['b'])
    expect(toggleKey(['x'], 'x')).toEqual([])
  })

  it('is idempotent: toggling twice restores the same membership', () => {
    const original = ['a', 'b', 'c']
    const once = toggleKey(original, 'b')
    const twice = toggleKey(once, 'b')
    // Append/remove semantics (no positional restore), so a double toggle
    // restores the SET of keys — same length, same members.
    expect(twice).toHaveLength(original.length)
    expect(twice).toEqual(expect.arrayContaining(original))
  })

  it('is immutable: never mutates the input list', () => {
    const original = ['a', 'b']
    const appended = toggleKey(original, 'c')
    const removed = toggleKey(original, 'a')
    expect(original).toEqual(['a', 'b'])
    expect(appended).not.toBe(original)
    expect(removed).not.toBe(original)
    expect(removed).toEqual(['b'])
  })

  it('preserves order when appending and removing', () => {
    expect(toggleKey(['z', 'a', 'm'], 'q')).toEqual(['z', 'a', 'm', 'q'])
    expect(toggleKey(['z', 'a', 'm'], 'a')).toEqual(['z', 'm'])
  })
})

describe('filterByBookmarks', () => {
  const marks = (keys: string[]): { key: string }[] => keys.map((key) => ({ key }))

  it('reports no filtering when there are no bookmarks', () => {
    expect(filterByBookmarks(marks(['a', 'b']), [])).toEqual({ visible: [], isFiltered: false })
  })

  it('returns ascending indices of marks whose key is bookmarked', () => {
    const result = filterByBookmarks(marks(['a', 'b', 'c', 'a']), ['a', 'c'])
    expect(result).toEqual({ visible: [0, 2, 3], isFiltered: true })
  })

  it('omits marks whose key is not bookmarked', () => {
    expect(filterByBookmarks(marks(['a', 'b', 'c']), ['b'])).toEqual({
      visible: [1],
      isFiltered: true,
    })
  })

  it('yields no visible indices when no mark matches the bookmarks', () => {
    expect(filterByBookmarks(marks(['a', 'b']), ['z'])).toEqual({ visible: [], isFiltered: true })
  })

  it('does not duplicate indices for duplicate bookmark keys', () => {
    expect(filterByBookmarks(marks(['a', 'b']), ['a', 'a'])).toEqual({
      visible: [0],
      isFiltered: true,
    })
  })

  it('does not mutate the marks or bookmarked inputs', () => {
    const inputMarks = marks(['a', 'b'])
    const bookmarked = ['b']
    filterByBookmarks(inputMarks, bookmarked)
    expect(inputMarks).toEqual([{ key: 'a' }, { key: 'b' }])
    expect(bookmarked).toEqual(['b'])
  })
})

describe('bookmarkCount', () => {
  it('counts zero for an empty list', () => {
    expect(bookmarkCount([])).toBe(0)
  })

  it('counts the entries in the list', () => {
    expect(bookmarkCount(['a', 'b', 'c'])).toBe(3)
  })

  it('counts duplicate entries as-is', () => {
    expect(bookmarkCount(['a', 'a'])).toBe(2)
  })
})
