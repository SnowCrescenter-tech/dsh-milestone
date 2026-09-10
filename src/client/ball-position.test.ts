/**
 * Unit tests for ball-position: the pure geometry behind the collapsed rail's
 * floating ball.
 *
 * Contract under test:
 *   - `clampBallPosition` keeps the whole circle inside the viewport, honors
 *     the margin when there is room, and degrades safely on absurd inputs
 *     (negative/oversized coordinates, viewports smaller than the ball,
 *     non-finite positions)
 *   - `isDragGesture` splits press gestures strictly at the drag threshold
 *   - `sanitizeBallPosition` admits only finite `{x, y}` pairs (never clamps)
 *   - `defaultBallPosition` hugs the requested side, vertically centers, and
 *     still clamps inside a tiny viewport
 */
import { describe, expect, it } from 'vitest'
import {
  BALL_MARGIN,
  BALL_SIZE,
  DRAG_THRESHOLD_PX,
  clampBallPosition,
  defaultBallPosition,
  isDragGesture,
  sanitizeBallPosition,
} from './ball-position.ts'
import type { BallPosition, BallViewport } from './ball-position.ts'

/** The roomy 800x600 viewport most clamp/default tests assume. */
const VIEWPORT: BallViewport = { width: 800, height: 600 }

describe('ball-position constants', () => {
  it('exports the canonical defaults', () => {
    expect(BALL_SIZE).toBe(40)
    expect(BALL_MARGIN).toBe(8)
    expect(DRAG_THRESHOLD_PX).toBe(5)
  })
})

describe('ball-position clampBallPosition', () => {
  it('leaves an already-inside position untouched', () => {
    expect(clampBallPosition({ x: 100, y: 100 }, VIEWPORT)).toEqual({ x: 100, y: 100 })
  })

  it('clamps a position past the right/bottom edge to the farthest visible spot', () => {
    // maxX = 800 - 40 - 8 = 752; maxY = 600 - 40 - 8 = 552.
    expect(clampBallPosition({ x: 9999, y: 9999 }, VIEWPORT)).toEqual({ x: 752, y: 552 })
  })

  it('clamps negative coordinates up to the margin', () => {
    expect(clampBallPosition({ x: -50, y: -50 }, VIEWPORT)).toEqual({ x: 8, y: 8 })
  })

  it('honors the margin when there is room (0 moves the ball to the margin, not the edge)', () => {
    expect(clampBallPosition({ x: 0, y: 0 }, VIEWPORT)).toEqual({ x: 8, y: 8 })
  })

  it('keeps the ball inside a viewport SMALLER than the ball (collapses to 0)', () => {
    const tiny: BallViewport = { width: 30, height: 20 }
    expect(clampBallPosition({ x: 100, y: 100 }, tiny)).toEqual({ x: 0, y: 0 })
    expect(clampBallPosition({ x: -100, y: -100 }, tiny)).toEqual({ x: 0, y: 0 })
  })

  it('degrades non-finite positions to 0 before clamping', () => {
    expect(clampBallPosition({ x: NaN, y: Infinity }, VIEWPORT)).toEqual({ x: 8, y: 8 })
    expect(clampBallPosition({ x: -Infinity, y: NaN }, VIEWPORT)).toEqual({ x: 8, y: 8 })
  })

  it('accepts a custom ball size and margin', () => {
    // maxX = 800 - 20 - 4 = 776; maxY = 600 - 20 - 4 = 576.
    expect(clampBallPosition({ x: 9999, y: 9999 }, VIEWPORT, 20, 4)).toEqual({ x: 776, y: 576 })
    expect(clampBallPosition({ x: 0, y: 0 }, VIEWPORT, 20, 4)).toEqual({ x: 4, y: 4 })
  })
})

describe('ball-position isDragGesture', () => {
  it('is false below the threshold and true above it', () => {
    expect(isDragGesture({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(false)
    expect(isDragGesture({ x: 0, y: 0 }, { x: 6, y: 0 })).toBe(true)
  })

  it('is false at exactly the threshold (strictly greater than)', () => {
    expect(isDragGesture({ x: 0, y: 0 }, { x: 5, y: 0 })).toBe(false)
    expect(isDragGesture({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false) // distance = 5
  })

  it('measures Euclidean (diagonal) travel', () => {
    expect(isDragGesture({ x: 0, y: 0 }, { x: 4, y: 4 })).toBe(true) // ≈ 5.66
    expect(isDragGesture({ x: 0, y: 0 }, { x: 3, y: 3 })).toBe(false) // ≈ 4.24
  })

  it('measures travel from the press start, not from the latest point', () => {
    const start: BallPosition = { x: 100, y: 100 }
    expect(isDragGesture(start, { x: 103, y: 104 })).toBe(false) // 5
    expect(isDragGesture(start, { x: 106, y: 108 })).toBe(true) // 10
  })

  it('honors a custom threshold', () => {
    expect(isDragGesture({ x: 0, y: 0 }, { x: 6, y: 8 }, 10)).toBe(false) // exactly 10
    expect(isDragGesture({ x: 0, y: 0 }, { x: 8, y: 8 }, 10)).toBe(true) // ≈ 11.31
    expect(isDragGesture({ x: 0, y: 0 }, { x: 1, y: 0 }, 0)).toBe(true)
  })

  it('a zero-travel press is never a drag', () => {
    expect(isDragGesture({ x: 50, y: 50 }, { x: 50, y: 50 })).toBe(false)
  })
})

describe('ball-position sanitizeBallPosition', () => {
  it('accepts a finite {x, y} pair unchanged, without clamping', () => {
    expect(sanitizeBallPosition({ x: 12, y: 34 })).toEqual({ x: 12, y: 34 })
    // Out-of-viewport and fractional values survive: clamping is a viewport concern.
    expect(sanitizeBallPosition({ x: -100, y: 9999.5 })).toEqual({ x: -100, y: 9999.5 })
  })

  it('ignores extra keys', () => {
    expect(sanitizeBallPosition({ x: 12, y: 34, side: 'left' })).toEqual({ x: 12, y: 34 })
  })

  it('rejects non-number coordinates', () => {
    expect(sanitizeBallPosition({ x: '12', y: 34 })).toBeNull()
    expect(sanitizeBallPosition({ x: 12, y: '34' })).toBeNull()
    expect(sanitizeBallPosition({ x: null, y: 34 })).toBeNull()
    expect(sanitizeBallPosition({ x: 12, y: true })).toBeNull()
  })

  it('rejects NaN / Infinity coordinates', () => {
    expect(sanitizeBallPosition({ x: NaN, y: 0 })).toBeNull()
    expect(sanitizeBallPosition({ x: 0, y: NaN })).toBeNull()
    expect(sanitizeBallPosition({ x: Infinity, y: 0 })).toBeNull()
    expect(sanitizeBallPosition({ x: 0, y: -Infinity })).toBeNull()
  })

  it('rejects partial objects', () => {
    expect(sanitizeBallPosition({ x: 12 })).toBeNull()
    expect(sanitizeBallPosition({ y: 34 })).toBeNull()
    expect(sanitizeBallPosition({})).toBeNull()
  })

  it('rejects null, arrays, strings and other non-objects', () => {
    expect(sanitizeBallPosition(null)).toBeNull()
    expect(sanitizeBallPosition(undefined)).toBeNull()
    expect(sanitizeBallPosition([])).toBeNull()
    expect(sanitizeBallPosition([12, 34])).toBeNull()
    expect(sanitizeBallPosition('{"x":12,"y":34}')).toBeNull()
    expect(sanitizeBallPosition(42)).toBeNull()
  })
})

describe('ball-position defaultBallPosition', () => {
  it('rests near the right edge when hugging right', () => {
    // x = 800 - 40 - 8; y = (600 - 40) / 2.
    expect(defaultBallPosition(VIEWPORT, 'right', 8)).toEqual({ x: 752, y: 280 })
  })

  it('rests near the left edge when hugging left', () => {
    expect(defaultBallPosition(VIEWPORT, 'left', 8)).toEqual({ x: 8, y: 280 })
  })

  it('is vertically centered for any inset', () => {
    expect(defaultBallPosition(VIEWPORT, 'left', 30).y).toBe(280)
    expect(defaultBallPosition(VIEWPORT, 'right', 0).y).toBe(280)
  })

  it('defaults the ball size and honors a custom one', () => {
    // x = 800 - 20 - 8; y = (600 - 20) / 2.
    expect(defaultBallPosition(VIEWPORT, 'right', 8, 20)).toEqual({ x: 772, y: 290 })
  })

  it('stays clamped inside a viewport smaller than the ball', () => {
    // maxX = max(0, 50 - 40 - 8) = 2; y raw = (30 - 40) / 2 collapses to 0.
    expect(defaultBallPosition({ width: 50, height: 30 }, 'right', 8)).toEqual({ x: 2, y: 0 })
    expect(defaultBallPosition({ width: 50, height: 30 }, 'left', 8)).toEqual({ x: 2, y: 0 })
  })
})
