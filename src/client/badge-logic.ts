/**
 * Pure turn-health badge derivation + styling for the milestone rail: given
 * the harness snapshot signals, decide which (if any) colored glow a mark's
 * dot should wear, plus the style tokens for that badge.
 *
 * Rendering contract (M-design change): a badge is NO LONGER a hard 2px ring
 * (border) — it is a concentric "soft glow" made of three layered box-shadows
 * (a crisp inner ring at 55% alpha, then two blurred blooms), and the
 * running/awaiting pulse breathes opacity + shadow intensity instead of
 * expanding a ring. The `data-badge` value and the semantic color of every
 * kind are unchanged.
 *
 * All functions are side-effect free (no React, no DOM) so the rail component
 * can consume them directly and tests can exercise them in isolation.
 */
import { rgbaString } from './accent-utils'

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
  /**
   * The static soft-glow box-shadow (three concentric layers):
   * `0 0 0 2px color@0.55` (inner ring) + `0 0 8px 2px color@0.45` (inner
   * bloom) + `0 0 16px 5px color@0.2` (outer halo).
   */
  readonly shadow: string
}

/** Ring colors and pulse flag per badge kind; running/awaiting pulse. */
const RING_STYLES: Readonly<Record<BadgeKind, Omit<BadgeRingStyle, 'shadow'>>> = {
  error: { color: '#ef4444', pulse: false },
  'max-tokens': { color: '#f59e0b', pulse: false },
  retry: { color: '#f97316', pulse: false },
  running: { color: '#4d7cfe', pulse: true },
  awaiting: { color: '#f59e0b', pulse: true },
}

/** Build the layered soft-glow shadow for a badge color. */
function glowShadow(color: string): string {
  const layer = (alpha: number): string => rgbaString(color, alpha) ?? 'currentColor'
  return [
    `0 0 0 2px ${layer(0.55)}`,
    `0 0 8px 2px ${layer(0.45)}`,
    `0 0 16px 5px ${layer(0.2)}`,
  ].join(', ')
}

/**
 * Style tokens for a badge kind.
 * @param badge - the derived badge kind.
 * @returns the glow color, whether the dot should pulse (breathing glow), and
 *   the static multi-layer box-shadow string for the badge span.
 */
export function badgeRingStyle(badge: BadgeKind): BadgeRingStyle {
  const base = RING_STYLES[badge]
  return { ...base, shadow: glowShadow(base.color) }
}

/**
 * Breathing-glow keyframes for one badge color. The rail injects this (via an
 * inline <style>) only while a pulsing badge is on screen — the color is baked
 * into the alphas, so the animation needs no runtime var lookups. Both stops
 * keep the SAME three-layer shape (only alpha/blur breathe), so the glow never
 * looks like the old expanding ring.
 */
export function badgePulseCss(color: string): string {
  const layer = (alpha: number): string => rgbaString(color, alpha) ?? 'currentColor'
  const bright = `0 0 0 2px ${layer(0.55)}, 0 0 8px 2px ${layer(0.45)}, 0 0 16px 5px ${layer(0.2)}`
  const dim = `0 0 0 2px ${layer(0.35)}, 0 0 4px 1px ${layer(0.25)}, 0 0 9px 3px ${layer(0.12)}`
  return `@keyframes milestone-badge-pulse {
  0%, 100% { opacity: 0.95; box-shadow: ${bright}; }
  50% { opacity: 0.45; box-shadow: ${dim}; }
}`
}