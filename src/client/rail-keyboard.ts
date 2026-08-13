/**
 * Pure roving-tabindex index math for the milestone rail.
 *
 * The dots list becomes a single roving-tabindex widget (ArrowUp/Down moves
 * focus, Home/End jumps to first/last). This module only owns the pure index
 * arithmetic; the widget wiring lives in the component.
 */

/**
 * Move `current` by `delta` (1 = forward, -1 = backward), wrapping around
 * `[0, count - 1]`. Returns `-1` when there are no focusable dots.
 */
export function nextFocusIndex(current: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return -1
  return (current + delta + count) % count
}

/**
 * Clamp `current` into `[0, count - 1]` — e.g. when the visible dot list
 * shrinks and the focused index no longer exists. Returns `-1` when there
 * are no focusable dots.
 */
export function clampIndex(current: number, count: number): number {
  if (count <= 0) return -1
  return Math.min(Math.max(current, 0), count - 1)
}
