/**
 * accent-utils: tiny pure color helpers behind the milestone rail's
 * accent-driven theming (the settings "强调色" personalization). Everything is
 * side-effect free (no React, no DOM) so the rail component and its tests can
 * share one implementation instead of sprinkling hex math over rail-logic.
 *
 * All functions accept (and reject) the same canonical form: a 6-digit
 * `#rrggbb` hex string, case-insensitive. Invalid input degrades to `null`
 * (or a caller-provided fallback) — the rail only passes sanitized prefs
 * accents, so the null path is defensive, never a runtime crash.
 */

/** A parsed RGB color, 0-255 per channel. */
export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

/** Parsed HSL color: hue 0-360, saturation 0-100, lightness 0-100. */
export interface Hsl {
  readonly h: number
  readonly s: number
  readonly l: number
}

/** True for a canonical 6-digit hex color (`#4d7cfd`, `#4D7CFD`). */
export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

/**
 * Parse a hex color into channels.
 * @param hex - `#rrggbb` (case-insensitive).
 * @returns the RGB channels, or null when `hex` is not a canonical hex color.
 */
export function hexToRgb(hex: string): Rgb | null {
  if (!isHexColor(hex)) return null
  const n = parseInt(hex.slice(1), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

/** Format an alpha to the short decimal form the rail's inline styles use (0.55, 0.2). */
function formatAlpha(alpha: number): number {
  return Math.round(Math.max(0, Math.min(1, alpha)) * 100) / 100
}

/**
 * Color as a CSS `rgb(r, g, b)` string.
 * @returns the rgb() string, or null when `hex` is invalid.
 */
export function rgbString(hex: string): string | null {
  const rgb = hexToRgb(hex)
  if (rgb === null) return null
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
}

/**
 * Color with alpha as a CSS `rgba(r, g, b, a)` string; alpha clamps to [0, 1].
 * @returns the rgba() string, or null when `hex` is invalid.
 */
export function rgbaString(hex: string, alpha: number): string | null {
  const rgb = hexToRgb(hex)
  if (rgb === null) return null
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${formatAlpha(alpha)})`
}

/**
 * Linear mix of two hex colors in RGB space.
 * @param a - start color (t = 0).
 * @param b - end color (t = 1).
 * @param t - mix factor, clamped to [0, 1].
 * @returns the mixed `#rrggbb`, or null when either input is invalid.
 */
export function mixHex(a: string, b: string, t: number): string | null {
  const ca = hexToRgb(a)
  const cb = hexToRgb(b)
  if (ca === null || cb === null) return null
  const k = Math.max(0, Math.min(1, t))
  const channel = (from: number, to: number): string =>
    Math.round(from + (to - from) * k)
      .toString(16)
      .padStart(2, '0')
  return `#${channel(ca.r, cb.r)}${channel(ca.g, cb.g)}${channel(ca.b, cb.b)}`
}

/**
 * Lighten a hex color toward white — the rail's "accent soft" text shade
 * (t = 0 keeps the color, t = 1 is white).
 */
export function lighten(hex: string, t: number): string | null {
  return mixHex(hex, '#ffffff', t)
}

/**
 * Convert a hex color to HSL. Double-checked against the standard RGB→HSL
 * formulas; saturation/lightness are percentages, hue is degrees.
 * @returns the HSL channels, or null when `hex` is invalid.
 */
export function hexToHsl(hex: string): Hsl | null {
  const rgb = hexToRgb(hex)
  if (rgb === null) return null
  const r = rgb.r / 255
  const g = rgb.g / 255
  const b = rgb.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  let h = 0
  if (delta !== 0) {
    if (max === r) h = 60 * (((g - b) / delta) % 6)
    else if (max === g) h = 60 * ((b - r) / delta + 2)
    else h = 60 * ((r - g) / delta + 4)
  }
  if (h < 0) h += 360
  const l = (max + min) / 2
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
  return { h, s: s * 100, l: l * 100 }
}