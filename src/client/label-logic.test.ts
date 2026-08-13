/**
 * Unit tests for the pure label-logic module: relative-time label derivation
 * (justNow/minutes/hours/days with bucket boundary checks) and session-end
 * reason key mapping. No React, no DOM.
 */
import { describe, it, expect } from 'vitest'
import { relativeTimeParts, reasonKeyOf } from './label-logic'

/** Fixed clock so every assertion is deterministic. */
const NOW = 1_700_000_000_000

describe('relativeTimeParts boundaries', () => {
  it('diff < 60s -> justNow with n=0', () => {
    expect(relativeTimeParts(NOW - 0, NOW)).toEqual({ key: 'time.justNow', n: 0 })
    expect(relativeTimeParts(NOW - 59_000, NOW)).toEqual({ key: 'time.justNow', n: 0 })
  })

  it('diff == 60s -> minutes with n=1 (justNow bucket ends below 60s)', () => {
    expect(relativeTimeParts(NOW - 60_000, NOW)).toEqual({ key: 'time.minutes', n: 1 })
  })

  it('diff < 3600s -> minutes bucket', () => {
    expect(relativeTimeParts(NOW - 3_599_000, NOW)).toEqual({ key: 'time.minutes', n: 59 })
  })

  it('diff == 3600s -> hours with n=1 (minutes bucket ends below 3600s)', () => {
    expect(relativeTimeParts(NOW - 3_600_000, NOW)).toEqual({ key: 'time.hours', n: 1 })
  })

  it('diff < 86400s -> hours bucket', () => {
    expect(relativeTimeParts(NOW - 86_399_000, NOW)).toEqual({ key: 'time.hours', n: 23 })
  })

  it('diff == 86400s -> days with n=1 (hours bucket ends below 86400s)', () => {
    expect(relativeTimeParts(NOW - 86_400_000, NOW)).toEqual({ key: 'time.days', n: 1 })
  })

  it('is deterministic for a given now', () => {
    const a = relativeTimeParts(NOW - 3_599_000, NOW)
    const b = relativeTimeParts(NOW - 3_599_000, NOW)
    expect(a).toEqual(b)
  })
})

describe('reasonKeyOf mapping', () => {
  it('maps every known reason kind', () => {
    expect(reasonKeyOf('completed')).toBe('reason.completed')
    expect(reasonKeyOf('aborted')).toBe('reason.aborted')
    expect(reasonKeyOf('error')).toBe('reason.error')
    expect(reasonKeyOf('max-tokens')).toBe('reason.maxTokens')
    expect(reasonKeyOf('interrupted')).toBe('reason.interrupted')
    expect(reasonKeyOf('blocked')).toBe('reason.blocked')
  })

  it('passes unknown kinds through unchanged', () => {
    expect(reasonKeyOf('cancelled-by-user')).toBe('cancelled-by-user')
    expect(reasonKeyOf('')).toBe('')
  })
})
