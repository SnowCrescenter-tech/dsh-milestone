/**
 * Pure bookmark logic for the milestone rail: membership, immutable
 * append/remove toggling, bookmark filtering of a mark list, and count.
 *
 * All functions are side-effect free (no React, no DOM) so the rail component
 * can consume them directly and tests can exercise them in isolation. The
 * persisted store engine lives in bookmarkStore.ts; this module only shapes
 * values.
 */

/**
 * Whether a key is currently bookmarked.
 * @param keys - the bookmark key list (in toggle order).
 * @param key - the key to look up.
 * @returns true when the key is present.
 */
export function isBookmarked(keys: readonly string[], key: string): boolean {
  return keys.includes(key)
}

/**
 * Immutable toggle: append the key when it is not bookmarked, remove it when
 * it is. Never mutates the input; returns a fresh list (order preserved).
 * @param keys - the bookmark key list (in toggle order).
 * @param key - the key to flip.
 * @returns a new list with the key toggled.
 */
export function toggleKey(keys: readonly string[], key: string): string[] {
  return isBookmarked(keys, key) ? keys.filter((k) => k !== key) : [...keys, key]
}

/**
 * Filter a mark list down to the bookmarked marks.
 * @param marks - marks in rail order (only `key` is consulted).
 * @param bookmarked - the bookmark key list.
 * @returns `visible` (ascending indices of marks whose key is bookmarked;
 * empty whenever there are no bookmarks) and `isFiltered` (true exactly when
 * any bookmark exists — callers treat it as "filter active").
 */
export function filterByBookmarks(
  marks: readonly { key: string }[],
  bookmarked: readonly string[],
): { visible: number[]; isFiltered: boolean } {
  if (bookmarked.length === 0) return { visible: [], isFiltered: false }
  const set = new Set(bookmarked)
  const visible = marks.reduce<number[]>((acc, mark, i) => {
    if (set.has(mark.key)) acc.push(i)
    return acc
  }, [])
  return { visible, isFiltered: true }
}

/**
 * Number of bookmarked keys.
 * @param keys - the bookmark key list.
 * @returns the list length.
 */
export function bookmarkCount(keys: readonly string[]): number {
  return keys.length
}
