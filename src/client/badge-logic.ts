/**
 * Pure turn-health badge derivation for the milestone rail: given the harness
 * snapshot signals, decide which (if any) colored ring a mark's dot should
 * wear, plus the style tokens (color + pulse) for that badge.
 *
 * All functions are side-effect free (no React, no DOM) so the rail component
 * can consume them directly and tests can exercise them in isolation.
 */

/** Every badge a mark's dot can wear. */
export type BadgeKind = 'error' | 'max-tokens' | 'retry' | 'running' | 'awaiting'

/** Snapshot signals that decide a mark's badge. */
export interface BadgeInput {
  /** Node kinds present on this mark (user message row), e.g. 'turn-error'. */
  readonly nodeKinds: readonly string[]
  /** Whether this mark is the newest mark in the rail. */
  readonly lastMark: boolean
  /** Session snapshot `running` flag (a turn is producing tokens). */
  readonly running: boolean
  /** Session snapshot has a pending interaction (awaiting human input). */
  readonly awaitingInput: boolean
}

/**
 * Derive the badge for one mark.
 *
 * Precedence: error > max-tokens > retry > running > awaiting. Node-derived
 * badges ('turn-error' -> error, 'turn-max-tokens' -> max-tokens,
 * 'model-retry' -> retry) fire regardless of `lastMark`; the transient badges
 * (running, awaiting) only apply to the newest mark. Callers must already
 * exclude cancelled retries — a bare 'model-retry' kind is treated as retry.
 *
 * @param input - the mark's snapshot signals.
 * @returns the winning badge kind, or null when no signal applies.
 */
export function deriveBadge(input: BadgeInput): BadgeKind | null {
  if (input.nodeKinds.includes('turn-error')) return 'error'
  if (input.nodeKinds.includes('turn-max-tokens')) return 'max-tokens'
  if (input.nodeKinds.includes('model-retry')) return 'retry'
  if (input.lastMark) {
    if (input.running) return 'running'
    if (input.awaitingInput) return 'awaiting'
  }
  return null
}

/** Dot ring style tokens for a badge kind. */
export interface BadgeRingStyle {
  readonly color: string
  readonly pulse: boolean
}

/** Ring colors and pulse flag per badge kind; running/awaiting pulse. */
const RING_STYLES: Readonly<Record<BadgeKind, BadgeRingStyle>> = {
  error: { color: '#ef4444', pulse: false },
  'max-tokens': { color: '#f59e0b', pulse: false },
  retry: { color: '#f97316', pulse: false },
  running: { color: '#4d7cfe', pulse: true },
  awaiting: { color: '#f59e0b', pulse: true },
}

/**
 * Style tokens for a badge kind.
 * @param badge - the derived badge kind.
 * @returns the ring color and whether the dot should pulse.
 */
export function badgeRingStyle(badge: BadgeKind): BadgeRingStyle {
  return RING_STYLES[badge]
}
