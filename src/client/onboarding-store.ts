/**
 * onboarding-store: the persistence layer for the 0.6.4 first-run tutorial —
 * a single "has the user seen it" flag with NO payload.
 *
 * Storage contract: one localStorage key (`dsh-milestone.onboarded`) whose
 * VALUE is exactly the string `'1'` when the tutorial was completed or
 * skipped. Anything else (absent key, `'0'`, `'true'`, garbage) means "never
 * shown" and re-triggers the tutorial.
 *
 * Both accessors swallow storage failures silently (SSR, sandboxed iframe,
 * quota): the tutorial is a best-effort enhancement — a broken storage must
 * never crash the rail, and a user in that environment simply sees the
 * tutorial once per page load instead of once ever.
 */
/** The single localStorage key holding the onboarding "seen" flag. */
export const ONBOARDED_KEY = 'dsh-milestone.onboarded'

/**
 * True when the user already completed or skipped the tutorial (the stored
 * value is exactly `'1'`). Storage unavailability degrades to `false`.
 */
export function readOnboardedFlag(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === '1'
  } catch {
    // Storage unavailable — treat as "never shown" (best effort).
    return false
  }
}

/**
 * Persist the tutorial as seen/completed by writing the literal string `'1'`.
 * Storage failures are swallowed — the flag simply will not survive a reload.
 */
export function writeOnboardedFlag(): void {
  try {
    localStorage.setItem(ONBOARDED_KEY, '1')
  } catch {
    // Storage unavailable — the flag won't persist; nothing we can do.
  }
}