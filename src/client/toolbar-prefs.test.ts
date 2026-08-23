/**
 * Unit tests for toolbar-prefs: the sanitize/persist layer behind the
 * collapsible toolbar's pinned features AND the settings personalization
 * (accent / icon size / edge distance / side).
 *
 * Contract under test:
 *   - `parsePrefs` degrades to the DEFAULT prefs for null / invalid JSON /
 *     wrong shapes and sanitizes real blobs field-by-field (whitelist pins,
 *     valid hex accent, stepped+clamped sliders, side enum)
 *   - backward compatibility: an old `{ pinned }`-only blob parses with the
 *     new fields at their defaults
 *   - `togglePin` flips membership purely and never admits an unknown id
 *   - `savePrefs`/`loadPrefs` round-trip the FULL blob through localStorage
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  TOOLBAR_PIN_IDS,
  TOOLBAR_PREFS_KEY,
  DEFAULT_PREFS,
  isToolbarPinId,
  loadPrefs,
  parsePrefs,
  savePrefs,
  togglePin,
  clampStep,
  DEFAULT_FOCUS_PREFS,
} from './toolbar-prefs.ts'
import type { ToolbarPinId, ToolbarPrefs } from './toolbar-prefs.ts'

const KEY = TOOLBAR_PREFS_KEY

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

/** Full prefs blob helper: spot the DEFAULT values where omitted. */
const blob = (over: Partial<ToolbarPrefs> = {}): string => JSON.stringify({ ...DEFAULT_PREFS, ...over })

describe('toolbar-prefs parsePrefs — defaults', () => {
  it('null (nothing stored) yields the DEFAULT prefs', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(undefined as unknown as string)).toEqual(DEFAULT_PREFS)
  })

  it('invalid JSON degrades to the DEFAULT prefs', () => {
    expect(parsePrefs('not json at all')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{"pinned": [}')).toEqual(DEFAULT_PREFS)
  })

  it('a non-object or a blob without a pinned array degrades to the DEFAULT prefs', () => {
    expect(parsePrefs('42')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('"search"')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{}')).toEqual(DEFAULT_PREFS)
    expect(parsePrefs('{"pinned": "search"}')).toEqual(DEFAULT_PREFS)
  })

  it('a fresh parse never aliases the canonical default object (mutations are safe)', () => {
    const parsed = parsePrefs(null)
    expect(parsed).not.toBe(DEFAULT_PREFS)
    expect(parsed).toEqual(DEFAULT_PREFS)
  })
})

describe('toolbar-prefs parsePrefs — pinned sanitization', () => {
  it('drops unknown ids and keeps only whitelist members', () => {
    expect(
      parsePrefs(blob({ pinned: ['search', 'updateCheck', 'bookmarks', 'nope'] as ToolbarPinId[] })),
    ).toEqual({ ...DEFAULT_PREFS, pinned: ['search', 'updateCheck', 'bookmarks'] })
  })

  it('dedupes repeated ids and preserves the first-seen (pin) order', () => {
    expect(parsePrefs(blob({ pinned: ['focus', 'search', 'focus', 'list'] as ToolbarPinId[] }))).toEqual({
      ...DEFAULT_PREFS,
      pinned: ['focus', 'search', 'list'],
    })
  })

  it('ignores non-string entries', () => {
    const weird = JSON.stringify({ ...DEFAULT_PREFS, pinned: ['bookmarks', 7, null, false] })
    expect(parsePrefs(weird)).toEqual({ ...DEFAULT_PREFS, pinned: ['bookmarks'] })
  })

  it('the registry includes the settings key as a pin-able feature', () => {
    expect(parsePrefs(blob({ pinned: ['settings'] as ToolbarPinId[] }))).toEqual({
      ...DEFAULT_PREFS,
      pinned: ['settings'],
    })
  })

  it('whitelist sanity: every exported id is a valid toolbar pin id', () => {
    for (const id of TOOLBAR_PIN_IDS) {
      expect(isToolbarPinId(id)).toBe(true)
    }
    expect(isToolbarPinId('ghost')).toBe(false)
  })
})

describe('toolbar-prefs parsePrefs — personalization sanitization', () => {
  it('accepts canonical accents lowercased; rejects malformed ones with the default', () => {
    expect(parsePrefs(blob({ accent: '#22C55E' }))).toEqual({ ...DEFAULT_PREFS, accent: '#22c55e' })
    expect(parsePrefs(blob({ accent: 'red' }))).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(blob({ accent: '#fff' }))).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(blob({ accent: '#gggggg' }))).toEqual(DEFAULT_PREFS)
  })

  it('iconSize snaps to the slider step and clamps to [20, 36]', () => {
    expect(parsePrefs(blob({ iconSize: 24 }))).toEqual({ ...DEFAULT_PREFS, iconSize: 24 })
    expect(parsePrefs(blob({ iconSize: 21 }))).toEqual({ ...DEFAULT_PREFS, iconSize: 22 })
    expect(parsePrefs(blob({ iconSize: 2 }))).toEqual({ ...DEFAULT_PREFS, iconSize: 20 })
    expect(parsePrefs(blob({ iconSize: 99 }))).toEqual({ ...DEFAULT_PREFS, iconSize: 36 })
    expect(parsePrefs(blob({ iconSize: NaN }))).toEqual(DEFAULT_PREFS)
    expect(parsePrefs(blob({ iconSize: 'big' as unknown as number }))).toEqual(DEFAULT_PREFS)
  })

  it('inset snaps to the slider step and clamps to [0, 40]', () => {
    expect(parsePrefs(blob({ inset: 10 }))).toEqual({ ...DEFAULT_PREFS, inset: 10 })
    expect(parsePrefs(blob({ inset: 11 }))).toEqual({ ...DEFAULT_PREFS, inset: 12 })
    expect(parsePrefs(blob({ inset: -5 }))).toEqual({ ...DEFAULT_PREFS, inset: 0 })
    expect(parsePrefs(blob({ inset: 55 }))).toEqual({ ...DEFAULT_PREFS, inset: 40 })
    expect(parsePrefs(blob({ inset: NaN }))).toEqual(DEFAULT_PREFS)
  })

  it('side accepts only left/right', () => {
    expect(parsePrefs(blob({ side: 'left' }))).toEqual({ ...DEFAULT_PREFS, side: 'left' })
    expect(parsePrefs(blob({ side: 'right' }))).toEqual({ ...DEFAULT_PREFS, side: 'right' })
    expect(parsePrefs(blob({ side: 'top' as unknown as ToolbarPrefs['side'] }))).toEqual(DEFAULT_PREFS)
  })

  it('backward compatible: an OLD {pinned}-only blob keeps pins and defaults the rest', () => {
    expect(parsePrefs(JSON.stringify({ pinned: ['search', 'focus'] }))).toEqual({
      ...DEFAULT_PREFS,
      pinned: ['search', 'focus'],
    })
  })
})

describe('toolbar-prefs parsePrefs — focus mix sanitization (0.6.3)', () => {
  it('defaults: dimThink on, dimTools/collapseThink off, opacity 0.4', () => {
    expect(parsePrefs(null).focus).toEqual(DEFAULT_FOCUS_PREFS)
    expect(parsePrefs(blob({})).focus).toEqual(DEFAULT_FOCUS_PREFS)
  })

  it('an OLD pre-0.6.3 blob (no focus field) gains the default focus mix', () => {
    const legacy = JSON.stringify({ pinned: ['search', 'focus'] })
    const parsed = parsePrefs(legacy)
    expect(parsed.focus).toEqual(DEFAULT_FOCUS_PREFS)
    expect(parsed.pinned).toEqual(['search', 'focus'])
  })

  it('accepts real booleans; invalid flag values fall back per-field', () => {
    const good = parsePrefs(
      blob({ focus: { dimThink: false, dimTools: true, collapseThink: true, opacity: 0.5 } }),
    )
    expect(good.focus).toEqual({ dimThink: false, dimTools: true, collapseThink: true, opacity: 0.5 })

    const bad = parsePrefs(
      blob({
        focus: { dimThink: 'on' as unknown as boolean, dimTools: 1 as unknown as boolean, collapseThink: null as unknown as boolean, opacity: 0.5 },
      }),
    )
    expect(bad.focus).toEqual({ dimThink: true, dimTools: false, collapseThink: false, opacity: 0.5 })
  })

  it('opacity snaps to the 0.1 step and clamps to [0.2, 0.8]', () => {
    const withOpacity = (opacity: number) => blob({ focus: { ...DEFAULT_FOCUS_PREFS, opacity } })
    expect(parsePrefs(withOpacity(0.3)).focus.opacity).toBe(0.3)
    expect(parsePrefs(withOpacity(0.26)).focus.opacity).toBe(0.3)
    expect(parsePrefs(withOpacity(0.84)).focus.opacity).toBe(0.8)
    expect(parsePrefs(withOpacity(0.1)).focus.opacity).toBe(0.2)
    expect(parsePrefs(withOpacity(1)).focus.opacity).toBe(0.8)
    expect(parsePrefs(withOpacity(NaN)).focus.opacity).toBe(0.4)
    expect(parsePrefs(withOpacity(0.30000000000000004)).focus.opacity).toBe(0.3)
  })

  it('a non-number opacity string falls back to the default strength', () => {
    const weird = JSON.stringify({
      ...DEFAULT_PREFS,
      focus: { ...DEFAULT_FOCUS_PREFS, opacity: 'soft' },
    })
    expect(parsePrefs(weird).focus.opacity).toBe(0.4)
  })

  it('a non-object focus field degrades to the default focus mix', () => {
    expect(parsePrefs(blob({ focus: 'dim' as unknown as ToolbarPrefs['focus'] })).focus).toEqual(
      DEFAULT_FOCUS_PREFS,
    )
    const numeric = JSON.stringify({ ...DEFAULT_PREFS, focus: 42 })
    expect(parsePrefs(numeric).focus).toEqual(DEFAULT_FOCUS_PREFS)
  })

  it('other fields survive a focus-bearing blob and the focus mix keeps its own values', () => {
    const parsed = parsePrefs(
      blob({
        focus: { dimThink: false, dimTools: true, collapseThink: true, opacity: 0.7 },
        accent: '#22c55e',
      }),
    )
    expect(parsed.accent).toBe('#22c55e')
    expect(parsed.focus).toEqual({ dimThink: false, dimTools: true, collapseThink: true, opacity: 0.7 })
  })

  it('savePrefs writes the sanitized focus mix and reset restores the defaults', () => {
    savePrefs({ ...DEFAULT_PREFS, focus: { dimThink: false, dimTools: true, collapseThink: true, opacity: 0.74 } })
    expect(loadPrefs().focus).toEqual({ dimThink: false, dimTools: true, collapseThink: true, opacity: 0.7 })
    savePrefs(DEFAULT_PREFS)
    expect(loadPrefs().focus).toEqual(DEFAULT_FOCUS_PREFS)
  })
})

describe('toolbar-prefs clampStep', () => {
  it('snaps finite values to the step within [min, max]; anything else falls back', () => {
    expect(clampStep(24, 20, 36, 2, 28)).toBe(24)
    expect(clampStep(21, 20, 36, 2, 28)).toBe(22)
    expect(clampStep(2, 20, 36, 2, 28)).toBe(20)
    expect(clampStep(99, 20, 36, 2, 28)).toBe(36)
    expect(clampStep('x', 20, 36, 2, 28)).toBe(28)
    expect(clampStep(NaN, 20, 36, 2, 28)).toBe(28)
    expect(clampStep(undefined, 20, 36, 2, 28)).toBe(28)
  })
})

describe('toolbar-prefs togglePin', () => {
  it('adds an absent id and removes a present one, preserving other prefs', () => {
    expect(togglePin(DEFAULT_PREFS, 'bookmarks')).toEqual({ ...DEFAULT_PREFS, pinned: ['bookmarks'] })
    const withPin = { ...DEFAULT_PREFS, pinned: ['bookmarks', 'focus'] as ToolbarPinId[] }
    expect(togglePin(withPin, 'bookmarks')).toEqual({ ...DEFAULT_PREFS, pinned: ['focus'] })
  })

  it('is pure: never mutates the input prefs', () => {
    const input: ToolbarPrefs = { ...DEFAULT_PREFS, pinned: ['list'] }
    const output = togglePin(input, 'search')
    expect(input).toEqual({ ...DEFAULT_PREFS, pinned: ['list'] })
    expect(output).toEqual({ ...DEFAULT_PREFS, pinned: ['list', 'search'] })
    expect(output).not.toBe(input)
  })

  it('ignores unknown ids and returns a copy', () => {
    const input: ToolbarPrefs = { ...DEFAULT_PREFS, pinned: ['bookmarks'] }
    expect(togglePin(input, 'ghost')).toEqual(input)
    expect(togglePin(input, 'ghost')).not.toBe(input)
  })

  it('dedupes when the input already contains repeats', () => {
    const dupes: ToolbarPrefs = { ...DEFAULT_PREFS, pinned: ['search', 'search'] }
    expect(togglePin(dupes, 'focus')).toEqual({ ...DEFAULT_PREFS, pinned: ['search', 'focus'] })
  })
})

describe('toolbar-prefs localStorage round-trip', () => {
  it('loadPrefs returns the DEFAULT prefs when nothing is stored', () => {
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('savePrefs + loadPrefs round-trip the FULL blob (jsdom localStorage)', () => {
    const prefs: ToolbarPrefs = {
      pinned: ['bookmarks', 'search'],
      accent: '#22c55e',
      iconSize: 32,
      inset: 8,
      side: 'left',
      locale: 'en',
      focus: { dimThink: true, dimTools: true, collapseThink: true, opacity: 0.6 },
    }
    savePrefs(prefs)
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify(prefs))
    expect(loadPrefs()).toEqual(prefs)
  })

  it('savePrefs writes the sanitized form (unknown/duplicate ids never persist)', () => {
    const bogus = { ...DEFAULT_PREFS, pinned: ['bookmarks', 'ghost', 'bookmarks'] as ToolbarPinId[] }
    savePrefs(bogus)
    expect(window.localStorage.getItem(KEY)).toBe(
      JSON.stringify({ ...DEFAULT_PREFS, pinned: ['bookmarks'] }),
    )
  })

  it('savePrefs(DEFAULT_PREFS) persists the canonical default blob (reset)', () => {
    savePrefs({ ...DEFAULT_PREFS, pinned: ['focus'] })
    savePrefs(DEFAULT_PREFS)
    expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify(DEFAULT_PREFS))
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })

  it('loadPrefs sanitizes a hand-edited blob instead of throwing', () => {
    window.localStorage.setItem(KEY, blob({ pinned: ['search', 'unknown', 'search'] as ToolbarPinId[] }))
    expect(loadPrefs()).toEqual({ ...DEFAULT_PREFS, pinned: ['search'] })
    window.localStorage.setItem(KEY, '{broken')
    expect(loadPrefs()).toEqual(DEFAULT_PREFS)
  })
})

describe('toolbar-prefs locale pref (language switch)', () => {
  it('defaults to "system" when absent or invalid', () => {
    expect(DEFAULT_PREFS.locale).toBe('system')
    expect(parsePrefs(null).locale).toBe('system')
    expect(parsePrefs(JSON.stringify({ pinned: ['search'] })).locale).toBe('system')
    expect(parsePrefs(JSON.stringify({ locale: 'fr' })).locale).toBe('system')
    expect(parsePrefs(JSON.stringify({ locale: 42 })).locale).toBe('system')
  })

  it('accepts zh and en', () => {
    expect(parsePrefs(JSON.stringify({ locale: 'zh' })).locale).toBe('zh')
    expect(parsePrefs(JSON.stringify({ locale: 'en' })).locale).toBe('en')
  })

  it('a legacy {pinned}-only blob keeps its pins and gains the default locale', () => {
    const parsed = parsePrefs(JSON.stringify({ pinned: ['bookmarks', 'focus'] }))
    expect(parsed.pinned).toEqual(['bookmarks', 'focus'])
    expect(parsed.locale).toBe('system')
  })
})