/**
 * Pure turn-group logic for the milestone rail: group consecutive marks by
 * turn, collapse a turn down to its last mark, and derive render indices /
 * separator positions for the dot timeline.
 *
 * All functions are side-effect free (no React, no DOM) so the rail component
 * can consume them directly and tests can exercise them in isolation.
 */

/**
 * A single milestone dot on the rail. `turn` is the conversation round the
 * mark belongs to; it is `undefined` when the mark carries no turn info.
 */
export interface GroupMark {
  readonly key: string
  readonly turn: number | undefined
}

/**
 * A consecutive run of marks sharing one turn. `turn` is `null` for marks
 * that carried no turn info — those never merge, each stays its own group.
 */
export interface TurnGroup {
  readonly turn: number | null
  readonly marks: readonly GroupMark[]
}

/**
 * One dot to render: the mark plus its index in the ORIGINAL flat marks
 * array, so search/count logic can still map back to the source list.
 */
export interface RenderItem {
  readonly mark: GroupMark
  readonly displayIndex: number
}

/**
 * Renumber the raw harness turn numbers into a compact 1-based DISPLAY
 * sequence over the marks that actually render. The harness numbers every
 * engine turn (subagent/injected turns included), so the raw numbers show
 * gaps (turns that produced no user mark) and repeats (several marks sharing
 * one turn); labels fed through this map read as clean 1, 2, 3, … rounds.
 *
 * Grouping and collapse logic keep operating on the RAW turn (same-turn marks
 * are contiguous in rail order, so first-appearance ranking preserves the
 * partition) — only labels consume this map.
 *
 * @param marks - marks in rail order (only `turn` is consulted).
 * @returns raw turn -> display round (1-based), in first-appearance order;
 *   turns that never appear (or marks without turn info) get no entry.
 */
export function buildDisplayTurns(marks: readonly GroupMark[]): ReadonlyMap<number, number> {
  const display = new Map<number, number>()
  let rank = 0
  for (const mark of marks) {
    if (mark.turn === undefined) continue
    if (display.has(mark.turn)) continue
    display.set(mark.turn, ++rank)
  }
  return display
}

/**
 * Partition consecutive marks by turn. Marks with the same numeric turn that
 * appear one after another share a group; each mark with `turn === undefined`
 * becomes its own singleton group with `turn: null`.
 * @param marks - marks in rail order.
 * @returns the groups, in original order, partitioning `marks` exactly.
 */
export function buildTurnGroups(marks: readonly GroupMark[]): TurnGroup[] {
  const groups: TurnGroup[] = []
  let current: { turn: number | null; marks: GroupMark[] } | undefined
  for (const mark of marks) {
    if (mark.turn === undefined) {
      current = undefined
      groups.push({ turn: null, marks: [mark] })
      continue
    }
    if (current !== undefined && current.turn === mark.turn) {
      current.marks.push(mark)
    } else {
      current = { turn: mark.turn, marks: [mark] }
      groups.push(current)
    }
  }
  return groups
}

/**
 * Flatten groups into render items, collapsing collapsed turns to their last
 * mark and reporting where separators belong.
 * @param groups - groups from {@link buildTurnGroups} (they partition the
 * original marks array in order, so a running count yields original indices).
 * @param collapsed - turns whose group should collapse to its LAST mark.
 * @returns `items` (one RenderItem per visible dot, in group order) and
 * `separatorsAt` (the index in `items` before which a separator should be
 * inserted at each non-first group boundary; never includes 0).
 */
export function buildRenderList(
  groups: readonly TurnGroup[],
  collapsed: ReadonlySet<number>,
): { readonly items: RenderItem[]; readonly separatorsAt: readonly number[] } {
  const items: RenderItem[] = []
  const separatorsAt: number[] = []
  let counter = 0
  for (const group of groups) {
    const startIndex = items.length
    const isCollapsed =
      group.turn !== null && collapsed.has(group.turn) && group.marks.length > 1
    if (isCollapsed) {
      const last = group.marks[group.marks.length - 1]
      items.push({ mark: last, displayIndex: counter + group.marks.length - 1 })
    } else {
      for (let i = 0; i < group.marks.length; i++) {
        items.push({ mark: group.marks[i], displayIndex: counter + i })
      }
    }
    counter += group.marks.length
    if (startIndex > 0) separatorsAt.push(startIndex)
  }
  return { items, separatorsAt }
}
