/**
 * Unit tests for the pure rail-keyboard module (roving-tabindex index math).
 * No React, no DOM. Later the dots list becomes one roving-tabindex widget;
 * this module only provides the pure index arithmetic.
 */
import { describe, it, expect } from 'vitest'
import { nextFocusIndex, clampIndex } from './rail-keyboard'

describe('nextFocusIndex', () => {
  it('wraps forward', () => {
    expect(nextFocusIndex(0, 3, 1)).toBe(1)
    expect(nextFocusIndex(1, 3, 1)).toBe(2)
    expect(nextFocusIndex(2, 3, 1)).toBe(0)
  })

  it('wraps backward', () => {
    expect(nextFocusIndex(2, 3, -1)).toBe(1)
    expect(nextFocusIndex(1, 3, -1)).toBe(0)
    expect(nextFocusIndex(0, 3, -1)).toBe(2)
  })

  it('returns -1 for count <= 0', () => {
    expect(nextFocusIndex(0, 0, 1)).toBe(-1)
    expect(nextFocusIndex(0, -1, -1)).toBe(-1)
  })

  it('single dot stays at 0 (wrap is a no-op)', () => {
    expect(nextFocusIndex(0, 1, 1)).toBe(0)
    expect(nextFocusIndex(0, 1, -1)).toBe(0)
  })
})

describe('clampIndex', () => {
  it('clamps an index beyond the new count to the last index (shrink)', () => {
    expect(clampIndex(7, 5)).toBe(4)
    expect(clampIndex(3, 2)).toBe(1)
  })

  it('clamps a negative index to 0', () => {
    expect(clampIndex(-1, 5)).toBe(0)
    expect(clampIndex(-42, 5)).toBe(0)
  })

  it('leaves an in-range index untouched', () => {
    expect(clampIndex(2, 5)).toBe(2)
    expect(clampIndex(0, 1)).toBe(0)
  })

  it('returns -1 for count <= 0', () => {
    expect(clampIndex(0, 0)).toBe(-1)
    expect(clampIndex(3, -2)).toBe(-1)
  })
})
