/**
 * Clipboard helper for the milestone rail: copies text to the system
 * clipboard via the async Clipboard API. Resolves false (never throws) when
 * the API is unavailable or the write is rejected, so callers can treat the
 * result as a plain boolean.
 */

/**
 * Copy text to the system clipboard.
 * @param text - the text to copy.
 * @returns a promise resolving to true when the clipboard write succeeded,
 * false when the Clipboard API is unavailable or the write was rejected.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.clipboard?.writeText === undefined) {
    return false
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
