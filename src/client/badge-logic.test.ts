/**
 * Unit tests for the pure badge-logic module: turn-health badge derivation
 * precedence (error > max-tokens > retry > running > awaiting), transient
 * badge gating on the last mark, and the per-kind SOFT-GLOW style tokens
 * (layered box-shadows, no border) + breathing-pulse keyframes.
 * No React, no DOM.
 */
import { describe, it, expect } from 'vitest'
import { deriveBadge, badgeRingStyle, badgePulseCss, type BadgeKind } from './badge-logic'

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
    it(`${badge} resolves to glow color ${color} with pulse=${pulse}`, () => {
      const style = badgeRingStyle(badge)
      expect(style.color).toBe(color)
      expect(style.pulse).toBe(pulse)
    })
  }

  it('the shadow is a 3-layer concentric soft glow (NO border)', () => {
    const style = badgeRingStyle('error')
    expect(style.shadow).toBe(
      '0 0 0 2px rgba(239, 68, 68, 0.55), 0 0 8px 2px rgba(239, 68, 68, 0.45), 0 0 16px 5px rgba(239, 68, 68, 0.2)',
    )
    // The first layer keeps the crisp 2px ring footprint the old border had.
    expect(style.shadow).toContain('0 0 0 2px rgba(239, 68, 68, 0.55)')
  })

  it('every shadow layer is built from its own color with alpha < 1', () => {
    for (const { badge, color } of cases) {
      const style = badgeRingStyle(badge)
      const red = color.slice(1, 3)
      const green = color.slice(3, 5)
      const blue = color.slice(5, 7)
      const hexChannel = (c: string): number => parseInt(c, 16)
      expect(style.shadow).toContain(`rgba(${hexChannel(red)}, ${hexChannel(green)}, ${hexChannel(blue)}, 0.55)`)
      expect(style.shadow).toContain(`rgba(${hexChannel(red)}, ${hexChannel(green)}, ${hexChannel(blue)}, 0.45)`)
      expect(style.shadow).toContain(`rgba(${hexChannel(red)}, ${hexChannel(green)}, ${hexChannel(blue)}, 0.2)`)
    }
  })
})

describe('badgePulseCss', () => {
  it('names the shared milestone-badge-pulse animation', () => {
    expect(badgePulseCss('#4d7cfe')).toContain('@keyframes milestone-badge-pulse')
  })

  it('breathes opacity AND shadow (same 3-layer shape, softer at mid-point)', () => {
    const css = badgePulseCss('#4d7cfe')
    // Bright stop: the exact static glow.
    expect(css).toContain(
      '0 0 0 2px rgba(77, 124, 254, 0.55), 0 0 8px 2px rgba(77, 124, 254, 0.45), 0 0 16px 5px rgba(77, 124, 254, 0.2)',
    )
    // Dim stop: same shape, lower alphas and blur (no expanding ring).
    expect(css).toContain(
      '0 0 0 2px rgba(77, 124, 254, 0.35), 0 0 4px 1px rgba(77, 124, 254, 0.25), 0 0 9px 3px rgba(77, 124, 254, 0.12)',
    )
    expect(css).toContain('opacity: 0.95')
    expect(css).toContain('opacity: 0.45')
  })

  it('bakes the color into both keyframe stops (no currentColor dependency)', () => {
    const css = badgePulseCss('#f59e0b')
    expect(css).not.toContain('currentColor')
    expect(css).toContain('rgba(245, 158, 11, ')
  })
})
