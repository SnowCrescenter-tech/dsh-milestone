/**
 * toolbar-prefs: the persistence layer for the milestone rail's collapsible
 * toolbar "pinned outside the collapse" preferences.
 *
 * Storage contract: one localStorage key (`dsh-milestone.toolbar`) holding
 * `{ "pinned": string[] }` — the ids of the function-key features the user
 * wants to keep visible while the toolbar is COLLAPSED. An absent or corrupt
 * value degrades to `[]` (everything folded away).
 *
 * All reads are sanitized: ids are checked against the canonical whitelist
 * (`TOOLBAR_PIN_IDS`), duplicates are dropped, unknown ids are discarded, and
 * the pinned order is the caller's first-seen order (the order ids were
 * pinned) — a future feature removal therefore never leaves a stale id
 * behind, and a hand-edited value can never smuggle an out-of-registry id
 * into render state.
 *
 * The whitelist lives HERE (not in MilestoneRail) so the pure functions stay
 * dependency-free and unit-testable; MilestoneRail's feature registry keys
 * itself against the same `ToolbarPinId` type, so id drift is a compile error.
 */
/** The single localStorage key holding the toolbar preference blob. */
export const TOOLBAR_PREFS_KEY = 'dsh-milestone.toolbar'

/**
 * Canonical function-key ids that may be pinned outside the collapse, in
 * toolbar render order. Adding a feature here (plus its registry entry in
 * MilestoneRail) is the whole "pin it" extension point.
 */
export const TOOLBAR_PIN_IDS = ['search', 'list', 'sessionSearch', 'bookmarks', 'focus', 'updateCheck'] as const

/** Id of one pin-able toolbar feature. */
export type ToolbarPinId = (typeof TOOLBAR_PIN_IDS)[number]

/** Type guard for registry ids — unknown strings never survive a parse. */
export function isToolbarPinId(id: string): id is ToolbarPinId {
  return (TOOLBAR_PIN_IDS as readonly string[]).includes(id)
}

/**
 * Parse + sanitize the raw persisted blob: `null` (nothing stored), invalid
 * JSON, or a non-`{pinned: string[]}` shape all degrade to `[]`; unknown ids
 * and duplicates are dropped; the result keeps the caller's first-seen
 * (pin) order.
 */
export function parsePrefs(raw: string | null): ToolbarPinId[] {
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return []
  }
  if (typeof parsed !== 'object' || parsed === null) return []
  const { pinned } = parsed as { pinned?: unknown }
  if (!Array.isArray(pinned)) return []
  const seen = new Set<ToolbarPinId>()
  const result: ToolbarPinId[] = []
  for (const id of pinned) {
    if (typeof id !== 'string' || !isToolbarPinId(id) || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

/**
 * Read + sanitize the persisted toolbar prefs from localStorage. Degrades to
 * `[]` when storage is unavailable (SSR, sandboxed iframe) — pinning is a
 * best-effort enhancement, never a render blocker.
 */
export function loadPrefs(): ToolbarPinId[] {
  try {
    return parsePrefs(localStorage.getItem(TOOLBAR_PREFS_KEY))
  } catch {
    return []
  }
}

/**
 * Persist the pinned ids (sanitized on the way out so a corrupt in-memory
 * value is never written). Takes plain strings — it cannot trust its input
 * any more than it trusts localStorage, so unknown ids are dropped, not
 * rejected. Swallows storage failures for the same best-effort reason as
 * {@link loadPrefs}.
 */
export function savePrefs(pinned: readonly string[]): void {
  const cleaned = parsePrefs(JSON.stringify({ pinned: [...pinned] }))
  try {
    localStorage.setItem(TOOLBAR_PREFS_KEY, JSON.stringify({ pinned: cleaned }))
  } catch {
    // Storage unavailable — prefs simply won't survive a reload.
  }
}

/**
 * Pure toggle: adds `id` to the pinned set when absent, removes it when
 * present. Unknown ids are ignored (the set is returned unchanged) and the
 * result is always deduped via the parse path, so callers can feed state
 * straight back into {@link savePrefs}.
 */
export function togglePin(pinned: readonly ToolbarPinId[], id: string): ToolbarPinId[] {
  if (!isToolbarPinId(id)) return [...pinned]
  const next = new Set(pinned)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return parsePrefs(JSON.stringify({ pinned: [...next] }))
}