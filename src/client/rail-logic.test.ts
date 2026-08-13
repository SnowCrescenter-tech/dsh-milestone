/**
 * Unit tests for the pure rail-logic module (search/filter, current-position
 * highlight, mark state precedence, dot color). No React, no DOM.
 */
import { describe, it, expect } from 'vitest'
import {
  extractText,
  filterMarks,
  nextMatchIndex,
  currentIndexOf,
  markState,
  dotColor,
} from './rail-logic'

/** Build a ContentBlock[] with a spread of text values including junk blocks. */
const blocks = (...texts: string[]): unknown[] => [
  { type: 'text', text: texts[0] ?? '' },
  { type: 'code', code: 'x' }, // non-text block: must be skipped
  ...texts.slice(1).map((text) => ({ type: 'text', text })),
]

describe('extractText', () => {
  it('joins text blocks with a single space and trims', () => {
    expect(extractText(blocks('first', 'second', 'third'))).toBe('first second third')
    expect(extractText(blocks('  padded  '))).toBe('padded')
  })

  it('returns the FULL text with no truncation beyond char 80', () => {
    const long = 'a'.repeat(200)
    expect(extractText(blocks(long, 'b'))).toBe(`${long} b`)
    expect(extractText(blocks(long, 'b')).length).toBe(202)
  })

  it('returns empty string for undefined, non-array, or empty array', () => {
    expect(extractText(undefined)).toBe('')
    expect(extractText(null)).toBe('')
    expect(extractText('not-an-array')).toBe('')
    expect(extractText({})).toBe('')
    expect(extractText([])).toBe('')
  })

  it('skips non-text blocks and non-string text values', () => {
    expect(extractText([{ type: 'code', text: 'ignored' }, { type: 'text', text: 'kept' }])).toBe('kept')
    expect(extractText([{ type: 'text', text: 42 }])).toBe('')
  })
})

describe('filterMarks', () => {
  const marks = [
    { key: 'k1', text: 'Alpha beta gamma' },
    { key: 'k2', text: 'delta' },
    { key: 'k3', text: 'ALPHA omega' },
  ]

  it('matches case-insensitively', () => {
    expect(filterMarks(marks, 'alpha').matches).toEqual([0, 2])
    expect(filterMarks(marks, 'ALPHA').matches).toEqual([0, 2])
  })

  it('matches text beyond char 80', () => {
    const tail = 'needle-in-the-long-tail'
    const longMarks = [{ key: 'k1', text: `x`.repeat(200) + tail }]
    expect(filterMarks(longMarks, 'needle').matches).toEqual([0])
  })

  it('empty or whitespace query matches all indices with active -1', () => {
    expect(filterMarks(marks, '')).toEqual({ matches: [0, 1, 2], active: -1 })
    expect(filterMarks(marks, '   ')).toEqual({ matches: [0, 1, 2], active: -1 })
  })

  it('no match yields empty matches and active -1', () => {
    expect(filterMarks(marks, 'zzz')).toEqual({ matches: [], active: -1 })
  })

  it('non-empty query picks the first match as active', () => {
    expect(filterMarks(marks, 'alpha').active).toBe(0)
    expect(filterMarks(marks, 'delta').active).toBe(1)
  })

  it('preserves ascending order of matches', () => {
    const out = filterMarks([{ key: 'a', text: 'x y' }, { key: 'b', text: 'y' }, { key: 'c', text: 'y z' }], 'y')
    expect(out.matches).toEqual([0, 1, 2])
  })
})

describe('nextMatchIndex', () => {
  it('wraps forward', () => {
    expect(nextMatchIndex(0, 3, 1)).toBe(1)
    expect(nextMatchIndex(2, 3, 1)).toBe(0)
  })

  it('wraps backward', () => {
    expect(nextMatchIndex(2, 3, -1)).toBe(1)
    expect(nextMatchIndex(0, 3, -1)).toBe(2)
  })

  it('returns -1 for count <= 0', () => {
    expect(nextMatchIndex(0, 0, 1)).toBe(-1)
    expect(nextMatchIndex(0, -1, -1)).toBe(-1)
  })
})

describe('currentIndexOf', () => {
  const rows = [
    { key: 'a', top: 0 },
    { key: 'b', top: 100 },
    { key: 'c', top: 200 },
  ]

  it('returns undefined for empty rows', () => {
    expect(currentIndexOf([], 0)).toBeUndefined()
  })

  it('returns first row key when no row is above the viewport', () => {
    expect(currentIndexOf(rows, -10)).toBe('a')
  })

  it('returns the row exactly at the viewport top (top <= viewportTop + 0.5)', () => {
    expect(currentIndexOf(rows, 100)).toBe('b')
  })

  it('returns the last row at or above the viewport top', () => {
    expect(currentIndexOf(rows, 150.4)).toBe('b')
    expect(currentIndexOf(rows, 250)).toBe('c')
    expect(currentIndexOf(rows, 200)).toBe('c')
  })

  it('applies the +0.5px epsilon to the at-or-above comparison', () => {
    expect(currentIndexOf(rows, 99.49)).toBe('a')
    expect(currentIndexOf(rows, 99.5)).toBe('b')
  })
})

describe('markState', () => {
  it('precedence: current > active > match > dimmed > normal', () => {
    const base = { key: 'k', hasQuery: false, isMatch: false, isActive: false, isCurrent: false }
    expect(markState({ ...base, isCurrent: true })).toBe('current')
    expect(markState({ ...base, isCurrent: true, isActive: true })).toBe('current')
    expect(markState({ ...base, isActive: true, isMatch: true })).toBe('active')
    expect(markState({ ...base, isActive: true, isCurrent: true, isMatch: true })).toBe('current')
    expect(markState({ ...base, isMatch: true })).toBe('match')
    expect(markState({ ...base, hasQuery: true })).toBe('dimmed')
    expect(markState({ ...base, hasQuery: true, isMatch: true })).toBe('match')
    expect(markState({ ...base })).toBe('normal')
  })
})

describe('dotColor', () => {
  it('total <= 1 uses t = 0 (lightest)', () => {
    expect(dotColor(0, 0)).toBe('hsl(218, 88%, 72%)')
    expect(dotColor(0, 1)).toBe('hsl(218, 88%, 72%)')
  })

  it('lightness is monotonic non-increasing as index grows (newest deepest)', () => {
    const lightnessOf = (c: string): number => Number(c.match(/hsl\(218, 88%, (\d+(?:\.\d+)?)%\)/)?.[1])
    const values = [0, 1, 2, 3, 4].map((i) => lightnessOf(dotColor(i, 5)))
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThan(values[i - 1])
    expect(values[0]).toBe(72)
    expect(values[4]).toBe(45)
  })

  it('produces the exact existing gradient endpoints', () => {
    expect(dotColor(0, 3)).toBe('hsl(218, 88%, 72%)')
    expect(dotColor(1, 3)).toBe('hsl(218, 88%, 58.5%)')
    expect(dotColor(2, 3)).toBe('hsl(218, 88%, 45%)')
  })
})
