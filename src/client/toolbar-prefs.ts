/**
 * toolbar-prefs: the persistence layer for the milestone rail's toolbar
 * personalization — WHICH function keys stay visible outside the collapse
 * (pinned) plus the settings-module appearance prefs (accent color, icon/dot
 * size, distance from the rail's screen edge, and rail side).
 *
 * Storage contract: one localStorage key (`dsh-milestone.toolbar`) holding a
 * JSON object:
 *
 *   { "pinned": string[], "accent": "#rrggbb", "iconSize": number,
 *     "inset": number, "side": "left" | "right", "locale": "system"|"zh"|"en" }
 *
 * Backward compatibility: the pre-personalization blob `{ "pinned": string[] }`
 * (and an entirely absent value) parses to the DEFAULT prefs with the new
 * fields at their defaults — old users keep their pins untouched.
 *
 * All reads are sanitized per field:
 *   - `pinned`: whitelisted ids only (`TOOLBAR_PIN_IDS`), duplicates dropped,
 *     first-seen (pin) order preserved;
 *   - `accent`: a canonical `#rrggbb` hex, lowercased; anything else falls
 *     back to the default blue;
 *   - `iconSize` / `inset`: finite numbers snapped to the slider step
 *     (even values) and clamped to the slider range;
 *   - `side`: exactly `'left'` or `'right'`.
 *
 * The whitelist lives HERE (not in MilestoneRail) so the pure functions stay
 * dependency-free and unit-testable; MilestoneRail's feature registry keys
 * itself against the same `ToolbarPinId` type, so id drift is a compile error.
 */
import { isHexColor } from './accent-utils'

/** The single localStorage key holding the toolbar preference blob. */
export const TOOLBAR_PREFS_KEY = 'dsh-milestone.toolbar'

/**
 * Canonical function-key ids that may be pinned outside the collapse, in
 * render order. `settings` is a REGULAR feature since the B-design move: the
 * gear left the always-visible chrome and now sits at the end of the expanded
 * feature queue (default unpinned). Adding a feature here (plus its registry
 * entry in MilestoneRail) is the whole "pin it" extension point.
 */
export const TOOLBAR_PIN_IDS = [
  'search',
  'list',
  'sessionSearch',
  'bookmarks',
  'focus',
  'updateCheck',
  'settings',
] as const

/** Id of one pin-able toolbar feature. */
export type ToolbarPinId = (typeof TOOLBAR_PIN_IDS)[number]

/** Which screen edge the rail hugs. */
export type RailSide = 'left' | 'right'

/** Rail copy language: 'system' follows the harness UI language; 'zh'/'en' force the plugin's own dictionaries. */
export type RailLocalePref = 'system' | 'zh' | 'en'

/** The full persisted toolbar preference set. */
export interface ToolbarPrefs {
  /** Feature ids kept visible while the toolbar is COLLAPSED. */
  readonly pinned: ToolbarPinId[]
  /** Accent hex color driving dots/tints/highlights. */
  readonly accent: string
  /** Icon/dot hit-area size in px (20–36, step 2; drives every dot metric). */
  readonly iconSize: number
  /** Rail offset from its screen edge in px (0–40, step 2). */
  readonly inset: number
  /** Which screen edge the rail hugs. */
  readonly side: RailSide
  /** Rail copy language: follow the harness locale, or force zh/en. */
  readonly locale: RailLocalePref
}

/** The default accent (the classic milestone blue). */
export const DEFAULT_ACCENT = '#4d7cfd'

/** Slider domain for the icon/dot size personalization. */
export const ICON_SIZE_MIN = 20
export const ICON_SIZE_MAX = 36
export const ICON_SIZE_STEP = 2
/** Slider domain for the edge-distance personalization. */
export const INSET_MIN = 0
export const INSET_MAX = 40
export const INSET_STEP = 2

/** The canonical default prefs ("恢复默认" target; also the read fallback). */
export const DEFAULT_PREFS: ToolbarPrefs = {
  pinned: [],
  accent: DEFAULT_ACCENT,
  iconSize: 28,
  inset: 14,
  side: 'right',
  locale: 'system',
}

/** Type guard for registry ids — unknown strings never survive a parse. */
export function isToolbarPinId(id: string): id is ToolbarPinId {
  return (TOOLBAR_PIN_IDS as readonly string[]).includes(id)
}

/** Whitelist + dedupe + first-seen-order sanitizer for the pinned list. */
function sanitizePinned(raw: unknown): ToolbarPinId[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<ToolbarPinId>()
  const result: ToolbarPinId[] = []
  for (const id of raw) {
    if (typeof id !== 'string' || !isToolbarPinId(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

/**
 * Snap a finite number to the nearest `step` inside [min, max]; any non-finite
 * or non-number input falls back to `fallback`. Used for both sliders so a
 * hand-edited blob (e.g. `iconSize: 21`) converges on a legal slider value.
 */
export function clampStep(
  value: unknown,
  min: number,
  max: number,
  step: number,
  fallback: number,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const clamped = Math.min(max, Math.max(min, value))
  const snapped = Math.round(clamped / step) * step
  // Rounding may push exactly onto one side of the range; re-clamp defensively.
  return Math.min(max, Math.max(min, snapped))
}

/**
 * Parse + sanitize the raw persisted blob: `null` (nothing stored), invalid
 * JSON, or a non-object shape all degrade to the DEFAULT prefs. Each field is
 * sanitized independently, so a half-corrupt blob keeps its valid parts
 * (e.g. an old `{pinned}`-only blob gains the default accent/size/inset/side).
 */
export function parsePrefs(raw: string | null): ToolbarPrefs {
  if (raw === null) return { ...DEFAULT_PREFS }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return { ...DEFAULT_PREFS }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_PREFS }
  const { pinned, accent, iconSize, inset, side, locale } = parsed as Record<string, unknown>
  return {
    pinned: sanitizePinned(pinned),
    accent:
      typeof accent === 'string' && isHexColor(accent)
        ? accent.toLowerCase()
        : DEFAULT_PREFS.accent,
    iconSize: clampStep(iconSize, ICON_SIZE_MIN, ICON_SIZE_MAX, ICON_SIZE_STEP, DEFAULT_PREFS.iconSize),
    inset: clampStep(inset, INSET_MIN, INSET_MAX, INSET_STEP, DEFAULT_PREFS.inset),
    side: side === 'left' || side === 'right' ? side : DEFAULT_PREFS.side,
    locale: locale === 'zh' || locale === 'en' || locale === 'system' ? locale : DEFAULT_PREFS.locale,
  }
}

/**
 * Read + sanitize the persisted toolbar prefs from localStorage. Degrades to
 * the DEFAULT prefs when storage is unavailable (SSR, sandboxed iframe) —
 * personalization is a best-effort enhancement, never a render blocker.
 */
export function loadPrefs(): ToolbarPrefs {
  try {
    return parsePrefs(localStorage.getItem(TOOLBAR_PREFS_KEY))
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

/**
 * Persist the full prefs (sanitized on the way out so a corrupt in-memory
 * value is never written). Swallows storage failures for the same best-effort
 * reason as {@link loadPrefs}.
 */
export function savePrefs(prefs: ToolbarPrefs): void {
  const cleaned = parsePrefs(JSON.stringify(prefs))
  try {
    localStorage.setItem(TOOLBAR_PREFS_KEY, JSON.stringify(cleaned))
  } catch {
    // Storage unavailable — prefs simply won't survive a reload.
  }
}

/**
 * Pure toggle: adds `id` to the pinned set when absent, removes it when
 * present. Unknown ids are ignored (prefs returned unchanged) and the pinned
 * set is always deduped via the sanitizer, so callers can feed the result
 * straight back into {@link savePrefs}.
 */
export function togglePin(prefs: ToolbarPrefs, id: string): ToolbarPrefs {
  if (!isToolbarPinId(id)) return { ...prefs }
  const next = new Set(prefs.pinned)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return { ...prefs, pinned: sanitizePinned([...next]) }
}