/**
 * ball-position: the pure geometry behind the collapsed rail's floating ball —
 * where the ball rests, how a pointer press is split into click vs drag, and
 * how a persisted position is sanitized.
 *
 * Everything here is TOTAL and dependency-free: any input (non-finite
 * coordinates, degenerate viewports, hand-edited storage blobs) yields a
 * usable result or an explicit `null`, never a throw.
 *
 * Viewport clamping is intentionally kept OUT of {@link sanitizeBallPosition}:
 * a persisted position is resolution-agnostic, so it is re-clamped against the
 * CURRENT viewport at render time — resizing a window or rotating a phone
 * keeps the ball fully on-screen without rewriting storage.
 */

/** A ball's top-left position in viewport coordinates (px, CSS). */
export interface BallPosition {
  readonly x: number
  readonly y: number
}

/** The usable viewport box the ball must stay inside. */
export interface BallViewport {
  readonly width: number
  readonly height: number
}

/** Default ball diameter. */
export const BALL_SIZE = 40

/** Preferred gap between the ball and the viewport edge (px). */
export const BALL_MARGIN = 8

/** Pointer travel (px) above which a press becomes a drag, not a click. */
export const DRAG_THRESHOLD_PX = 5

/**
 * Clamp a ball's top-left so the WHOLE circle stays inside the viewport.
 *
 * Per axis: `max = Math.max(0, viewportSize - ballSize - margin)` and
 * `min = Math.min(margin, max)`. When there IS room, `min` is the margin, so
 * the ball keeps its preferred distance from the edge; when the viewport is
 * smaller than ball + margins, `max` collapses to 0 (or below) and `min`
 * follows it, pinning the ball to the top/left outer edge instead of letting
 * it escape the viewport.
 *
 * Non-finite `pos` values degrade to `0` BEFORE clamping, so a corrupt call
 * still lands on a finite, fully-visible position.
 */
export function clampBallPosition(
  pos: BallPosition,
  viewport: BallViewport,
  ballSize: number = BALL_SIZE,
  margin: number = BALL_MARGIN,
): BallPosition {
  const xRaw = Number.isFinite(pos.x) ? pos.x : 0
  const yRaw = Number.isFinite(pos.y) ? pos.y : 0
  const maxX = Math.max(0, viewport.width - ballSize - margin)
  const minX = Math.min(margin, maxX)
  const maxY = Math.max(0, viewport.height - ballSize - margin)
  const minY = Math.min(margin, maxY)
  return {
    x: Math.min(maxX, Math.max(minX, xRaw)),
    y: Math.min(maxY, Math.max(minY, yRaw)),
  }
}

/**
 * True when pointer travel from `start` to `current` exceeds the drag
 * threshold — the gesture vocabulary of the ball: a press that stays put (or
 * wiggles less than the threshold) is a CLICK (toggle the rail), a press that
 * travels farther is a DRAG (move the ball).
 *
 * Distance is Euclidean, so a diagonal move counts the same as a straight one.
 * EXACTLY at the threshold is still a click (strictly greater than).
 */
export function isDragGesture(
  start: BallPosition,
  current: BallPosition,
  threshold: number = DRAG_THRESHOLD_PX,
): boolean {
  const dx = current.x - start.x
  const dy = current.y - start.y
  return Math.hypot(dx, dy) > threshold
}

/**
 * Sanitize a persisted ball position; return null when unusable.
 *
 * Accepts only a plain object carrying FINITE numeric `x` and `y` (extra keys
 * are ignored, so a future blob extension stays readable). Everything else —
 * `null`, arrays, strings, numbers, NaN/Infinity, missing keys — degrades to
 * `null`, which callers read as "no stored position, use the computed default
 * resting spot" (see {@link defaultBallPosition}).
 *
 * No clamping happens here: the stored value is resolution-agnostic and gets
 * clamped against the live viewport by {@link clampBallPosition} at render
 * time.
 */
export function sanitizeBallPosition(raw: unknown): BallPosition | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { x, y } = raw as { x?: unknown; y?: unknown }
  if (typeof x !== 'number' || !Number.isFinite(x)) return null
  if (typeof y !== 'number' || !Number.isFinite(y)) return null
  return { x, y }
}

/**
 * Default resting spot: hugging `side` at `inset` from the edge, vertically
 * centered. `inset` is measured from the nearest screen edge; the vertical
 * axis is simply centered on the viewport.
 *
 * The raw spot is always passed through {@link clampBallPosition} with the
 * default margin, so the resting spot is fully visible even when `inset`
 * overflows or the viewport is smaller than the ball.
 */
export function defaultBallPosition(
  viewport: BallViewport,
  side: 'left' | 'right',
  inset: number,
  ballSize: number = BALL_SIZE,
): BallPosition {
  const x = side === 'left' ? inset : viewport.width - ballSize - inset
  const y = (viewport.height - ballSize) / 2
  return clampBallPosition({ x, y }, viewport, ballSize, BALL_MARGIN)
}
