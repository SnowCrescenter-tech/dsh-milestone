/**
 * Pure label derivation for the milestone rail tooltip: bucket a timestamp
 * into a relative-time label (justNow/minutes/hours/days) and map a session
 * end-reason to a stable i18n key.
 *
 * All functions are side-effect free (no React, no DOM) so the tooltip can
 * consume them directly and tests can exercise them in isolation.
 */

/** Relative-time label key, suffixed by an integer count for pluralization. */
export type RelativeTimeKey = 'time.justNow' | 'time.minutes' | 'time.hours' | 'time.days'

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

/**
 * Bucket an elapsed duration into a relative-time label.
 *
 * Buckets on `now - time` in milliseconds: below 60s -> justNow (n=0), below
 * 3600s -> minutes, below 86400s -> hours, otherwise days. `n` is the whole
 * count of the bucket unit (floor). Deterministic for a given `now`.
 *
 * @param time - the event timestamp in ms since epoch.
 * @param now - the reference clock in ms since epoch.
 * @returns the label key and bucket count.
 */
export function relativeTimeParts(time: number, now: number): { key: RelativeTimeKey; n: number } {
  const diff = now - time
  if (diff < MINUTE_MS) return { key: 'time.justNow', n: 0 }
  if (diff < HOUR_MS) return { key: 'time.minutes', n: Math.floor(diff / MINUTE_MS) }
  if (diff < DAY_MS) return { key: 'time.hours', n: Math.floor(diff / HOUR_MS) }
  return { key: 'time.days', n: Math.floor(diff / DAY_MS) }
}

/**
 * Map a harness end-reason string to a stable i18n key.
 * @param kind - the raw end-reason string (e.g. 'max-tokens').
 * @returns the i18n key, or the raw kind unchanged when unknown.
 */
export function reasonKeyOf(kind: string): string {
  switch (kind) {
    case 'completed':
      return 'reason.completed'
    case 'aborted':
      return 'reason.aborted'
    case 'error':
      return 'reason.error'
    case 'max-tokens':
      return 'reason.maxTokens'
    case 'interrupted':
      return 'reason.interrupted'
    case 'blocked':
      return 'reason.blocked'
    default:
      return kind
  }
}
