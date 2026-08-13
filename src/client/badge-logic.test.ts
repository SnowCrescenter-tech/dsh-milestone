/**
 * Unit tests for the pure badge-logic module: turn-health badge derivation
 * precedence (error > max-tokens > retry > running > awaiting), transient
 * badge gating on the last mark, and per-kind dot style tokens.
 * No React, no DOM.
 */
import { describe, it, expect } from 'vitest'
import { deriveBadge, badgeRingStyle, type BadgeKind } from './badge-logic'

/** Base input with every signal off. */
const base = { nodeKinds: [], lastMark: false, running: false, awaitingInput: false } as const

describe('deriveBadge precedence', () => {
  it('error beats everything else', () => {
    expect(deriveBadge({ ...base, nodeKinds: ['turn-error'] })).toBe('error')
    expect(
      deriveBadge({ ...base, nodeKinds: ['turn-error', 'turn-max-tokens', 'model-retry'], lastMark: true, running: true, awaitingInput: true }),
    ).toBe('error')
    // error wins regardless of lastMark and transient signals
    expect(deriveBadge({ ...base, nodeKinds: ['turn-error'], running: true })).toBe('error')
  })

  it('max-tokens beats retry, running, and awaiting', () => {
    expect(
      deriveBadge({ ...base, nodeKinds: ['turn-max-tokens', 'model-retry'], lastMark: true, running: true, awaitingInput: true }),
    ).toBe('max-tokens')
    expect(deriveBadge({ ...base, nodeKinds: ['turn-max-tokens'], lastMark: true, awaitingInput: true })).toBe('max-tokens')
  })

  it('retry beats running and awaiting', () => {
    expect(deriveBadge({ ...base, nodeKinds: ['model-retry'], lastMark: true, running: true, awaitingInput: true })).toBe('retry')
    expect(deriveBadge({ ...base, nodeKinds: ['model-retry'], lastMark: true, awaitingInput: true })).toBe('retry')
  })

  it('running beats awaiting', () => {
    expect(deriveBadge({ ...base, lastMark: true, running: true, awaitingInput: true })).toBe('running')
  })
})

describe('deriveBadge transient gating', () => {
  it('running badge only when lastMark is true', () => {
    expect(deriveBadge({ ...base, running: true })).toBeNull()
    expect(deriveBadge({ ...base, running: true, awaitingInput: true })).toBeNull()
    expect(deriveBadge({ ...base, lastMark: true, running: true })).toBe('running')
  })

  it('awaiting badge only when lastMark is true', () => {
    expect(deriveBadge({ ...base, awaitingInput: true })).toBeNull()
    expect(deriveBadge({ ...base, lastMark: true, awaitingInput: true })).toBe('awaiting')
  })

  it('error, max-tokens, and retry are shown regardless of lastMark', () => {
    expect(deriveBadge({ ...base, nodeKinds: ['turn-error'] })).toBe('error')
    expect(deriveBadge({ ...base, nodeKinds: ['turn-max-tokens'] })).toBe('max-tokens')
    expect(deriveBadge({ ...base, nodeKinds: ['model-retry'] })).toBe('retry')
  })

  it('node kind beats running/awaiting even when lastMark is false (no gating)', () => {
    expect(deriveBadge({ ...base, nodeKinds: ['turn-error'], running: true, awaitingInput: true })).toBe('error')
    expect(deriveBadge({ ...base, nodeKinds: ['turn-max-tokens'], running: true })).toBe('max-tokens')
    expect(deriveBadge({ ...base, nodeKinds: ['model-retry'], awaitingInput: true })).toBe('retry')
  })
})

describe('deriveBadge no signal', () => {
  it('returns null when nothing applies', () => {
    expect(deriveBadge(base)).toBeNull()
    expect(deriveBadge({ ...base, nodeKinds: ['user', 'assistant'] })).toBeNull()
    expect(deriveBadge({ ...base, lastMark: true })).toBeNull()
  })

  it('ignores unknown node kinds', () => {
    expect(deriveBadge({ ...base, nodeKinds: ['user', 'unknown-kind', 'tool-result'] })).toBeNull()
  })
})

describe('badgeRingStyle', () => {
  const cases: ReadonlyArray<{ badge: BadgeKind; color: string; pulse: boolean }> = [
    { badge: 'error', color: '#ef4444', pulse: false },
    { badge: 'max-tokens', color: '#f59e0b', pulse: false },
    { badge: 'retry', color: '#f97316', pulse: false },
    { badge: 'running', color: '#4d7cfe', pulse: true },
    { badge: 'awaiting', color: '#f59e0b', pulse: true },
  ]

  for (const { badge, color, pulse } of cases) {
    it(`${badge} renders ${color} with pulse=${pulse}`, () => {
      expect(badgeRingStyle(badge)).toEqual({ color, pulse })
    })
  }
})
