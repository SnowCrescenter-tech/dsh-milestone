/**
 * Pure rail logic for the milestone rail: full-text search matching, current-
 * position highlight, match-cycle navigation, mark visual state, and dot color.
 *
 * All functions are side-effect free (no React, no DOM) so the rail component
 * can consume them directly and tests can exercise them in isolation.
 */

/** One text content block inside a user message's ContentBlock[] payload. */
interface TextBlock {
  readonly type: 'text'
  readonly text: string
}

/**
 * Extract the FULL plain text of a ContentBlock[] payload: the `text` of every
 * `{ type: 'text', text: string }` block, joined with a single space and
 * trimmed. Unlike the rail's hover preview this is NOT truncated — callers use
 * it for search matching, so the entire message must be searchable.
 * @param content - untrusted payload; anything that is not an array yields ''.
 */
export function extractText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const block of content) {
    if (block !== null && typeof block === 'object' && (block as { type?: unknown }).type === 'text') {
      const text = (block as { text?: unknown }).text
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join(' ').trim()
}

/** A searchable mark: its node key plus the full (untruncated) message text. */
interface SearchableMark {
  readonly key: string
  readonly text: string
}

/**
 * Case-insensitive substring filter over mark texts.
 * @param marks - marks in rail order.
 * @param query - the search query; empty/whitespace matches everything.
 * @returns `matches` (ascending indices whose text includes the lowercased
 * query; all indices when the query is blank) and `active` (the first match
 * index, or -1 when the query is blank or nothing matches).
 */
export function filterMarks(
  marks: readonly SearchableMark[],
  query: string,
): { matches: readonly number[]; active: number } {
  const q = query.trim()
  if (q === '') return { matches: marks.map((_, i) => i), active: -1 }
  const lower = q.toLowerCase()
  const matches = marks.reduce<number[]>((acc, mark, i) => {
    if (mark.text.toLowerCase().includes(lower)) acc.push(i)
    return acc
  }, [])
  return { matches, active: matches.length > 0 ? matches[0] : -1 }
}

/**
 * Wrap-around match navigation.
 * @param current - the currently active match index (any number; used raw).
 * @param count - number of matches; `<= 0` yields -1.
 * @param delta - +1 to advance, -1 to go back.
 * @returns `(current + delta + count) % count`, or -1 when count <= 0.
 */
export function nextMatchIndex(current: number, count: number, delta: 1 | -1): number {
  if (count <= 0) return -1
  return (current + delta + count) % count
}

/** A positioned chat row: its node key and offset top within the scrollport. */
interface PositionedRow {
  readonly key: string
  readonly top: number
}

/**
 * Key of the row the viewport top currently sits in: the last row whose top is
 * at or just above the viewport top (within a 0.5px epsilon).
 * @param rows - rows in document order (ascending top).
 * @param viewportTop - scrollport's current scroll offset.
 * @returns that row's key; the first row's key when every row is below the
 * viewport; undefined when there are no rows.
 */
export function currentIndexOf(rows: readonly PositionedRow[], viewportTop: number): string | undefined {
  if (rows.length === 0) return undefined
  let current = rows[0]
  for (const row of rows) {
    if (row.top <= viewportTop + 0.5) current = row
    else break
  }
  return current.key
}

/** Inputs that decide a mark's visual state. */
export interface MarkStateOpts {
  readonly key: string
  readonly hasQuery: boolean
  readonly isMatch: boolean
  readonly isActive: boolean
  readonly isCurrent: boolean
}

/** Visual states, highest priority first: current > active > match > dimmed > normal. */
export type MarkState = 'current' | 'active' | 'match' | 'dimmed' | 'normal'

/**
 * Compute a mark's visual state from search + position signals.
 * Precedence: `current` (row at viewport top) > `active` (first query match) >
 * `match` (any query match) > `dimmed` (query active, not a match) > `normal`.
 * @param opts - the mark's signals (key is kept for caller symmetry).
 */
export function markState(opts: MarkStateOpts): MarkState {
  if (opts.isCurrent) return 'current'
  if (opts.isActive) return 'active'
  if (opts.isMatch) return 'match'
  if (opts.hasQuery) return 'dimmed'
  return 'normal'
}

/**
 * Blue gradient dot color, reproduced exactly from MilestoneRail: newest
 * (highest index) is deepest, oldest is lightest. 72% lightness fading to 45%.
 * @param index - dot position in the rail (0 = oldest).
 * @param total - number of dots.
 */
export function dotColor(index: number, total: number): string {
  const t = total <= 1 ? 0 : index / (total - 1)
  const lightness = 72 - t * 27 // 72% -> 45%
  return `hsl(218, 88%, ${lightness}%)`
}
