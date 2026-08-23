/**
 * Unit tests for the pure color helpers in accent-utils (the settings
 * 强调色 personalization). No React, no DOM.
 */
import { describe, it, expect } from 'vitest'
import {
  isHexColor,
  hexToRgb,
  rgbString,
  rgbaString,
  mixHex,
  lighten,
  hexToHsl,
} from './accent-utils'

describe('isHexColor', () => {
  it('accepts canonical 6-digit hex, case-insensitive', () => {
    expect(isHexColor('#4d7cfd')).toBe(true)
    expect(isHexColor('#4D7CFD')).toBe(true)
    expect(isHexColor('#ffffff')).toBe(true)
  })

  it('rejects non-hex, wrong-length, and missing-# values', () => {
    expect(isHexColor('4d7cfd')).toBe(false)
    expect(isHexColor('#4d7cf')).toBe(false)
    expect(isHexColor('#4d7cfd0')).toBe(false)
    expect(isHexColor('#gggggg')).toBe(false)
    expect(isHexColor('')).toBe(false)
    expect(isHexColor('blue')).toBe(false)
  })
})

describe('hexToRgb', () => {
  it('parses the default accent into its channels', () => {
    expect(hexToRgb('#4d7cfd')).toEqual({ r: 77, g: 124, b: 253 })
  })

  it('returns null for invalid input', () => {
    expect(hexToRgb('nope')).toBeNull()
    expect(hexToRgb('#fff')).toBeNull()
  })
})

describe('rgbString / rgbaString', () => {
  it('formats css rgb() and rgba() strings', () => {
    expect(rgbString('#4d7cfd')).toBe('rgb(77, 124, 253)')
    expect(rgbaString('#4d7cfd', 0.55)).toBe('rgba(77, 124, 253, 0.55)')
  })

  it('clamps alpha into [0, 1] and rounds to two decimals', () => {
    expect(rgbaString('#ef4444', 2)).toBe('rgba(239, 68, 68, 1)')
    expect(rgbaString('#ef4444', -1)).toBe('rgba(239, 68, 68, 0)')
    expect(rgbaString('#ef4444', 1 / 3)).toBe('rgba(239, 68, 68, 0.33)')
  })

  it('returns null for invalid input', () => {
    expect(rgbString('x')).toBeNull()
    expect(rgbaString('x', 0.5)).toBeNull()
  })
})

describe('mixHex / lighten', () => {
  it('t=0 is the start color, t=1 the end color', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff')
  })

  it('t=0.5 is the channel midpoint', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#ff0000', '#0000ff', 0.5)).toBe('#800080')
  })

  it('lighten mixes toward white', () => {
    expect(lighten('#4d7cfd', 0)).toBe('#4d7cfd')
    expect(lighten('#4d7cfd', 1)).toBe('#ffffff')
  })

  it('returns null when either input is invalid', () => {
    expect(mixHex('bad', '#ffffff', 0.5)).toBeNull()
    expect(lighten('bad', 0.5)).toBeNull()
  })
})

describe('hexToHsl', () => {
  it('pure red is hsl(0, 100%, 50%)', () => {
    expect(hexToHsl('#ff0000')).toEqual({ h: 0, s: 100, l: 50 })
  })

  it('pure green is hsl(120, 100%, 50%)', () => {
    expect(hexToHsl('#00ff00')).toEqual({ h: 120, s: 100, l: 50 })
  })

  it('the default accent resolves to the rail gradient hue/saturation', () => {
    const hsl = hexToHsl('#4d7cfd')
    expect(hsl).not.toBeNull()
    expect(Math.round(hsl!.h)).toBe(224)
    expect(Math.round(hsl!.s)).toBe(98)
  })

  it('gray has zero saturation; invalid input is null', () => {
    expect(hexToHsl('#808080')).toEqual({ h: 0, s: 0, l: 50.19607843137255 })
    expect(hexToHsl('nope')).toBeNull()
  })
})