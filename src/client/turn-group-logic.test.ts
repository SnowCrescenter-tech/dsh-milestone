/**
 * Unit tests for the pure turn-group-logic module: grouping consecutive
 * marks by turn, collapsing a turn down to its last mark, and deriving
 * render indices / separator positions for the rail. No React, no DOM.
 */
import { describe, it, expect } from 'vitest'
import { buildRenderList, buildTurnGroups } from './turn-group-logic'
import type { GroupMark } from './turn-group-logic'

const m = (key: string, turn?: number): GroupMark => ({ key, turn })

describe('buildTurnGroups', () => {
  it('groups consecutive marks with the same turn into one run', () => {
    expect(buildTurnGroups([m('a', 1), m('b', 1), m('c', 1)])).toEqual([
      { turn: 1, marks: [m('a', 1), m('b', 1), m('c', 1)] },
    ])
  })

  it('starts a new group when the turn changes', () => {
    expect(buildTurnGroups([m('a', 1), m('b', 2)])).toEqual([
      { turn: 1, marks: [m('a', 1)] },
      { turn: 2, marks: [m('b', 2)] },
    ])
  })

  it('opens a new group when the same turn reappears non-consecutively', () => {
    expect(buildTurnGroups([m('a', 1), m('b', 2), m('c', 1)])).toEqual([
      { turn: 1, marks: [m('a', 1)] },
      { turn: 2, marks: [m('b', 2)] },
      { turn: 1, marks: [m('c', 1)] },
    ])
  })

  it('turns every undefined-turn mark into its own singleton group with turn null', () => {
    expect(buildTurnGroups([m('a'), m('b'), m('c', 1)])).toEqual([
      { turn: null, marks: [{ key: 'a' }] },
      { turn: null, marks: [{ key: 'b' }] },
      { turn: 1, marks: [{ key: 'c', turn: 1 }] },
    ])
  })

  it('keeps undefined-turn marks separate from adjacent same-turn runs', () => {
    expect(buildTurnGroups([m('a', 1), m('b'), m('c', 1)])).toEqual([
      { turn: 1, marks: [m('a', 1)] },
      { turn: null, marks: [{ key: 'b' }] },
      { turn: 1, marks: [m('c', 1)] },
    ])
  })

  it('returns an empty list for empty input', () => {
    expect(buildTurnGroups([])).toEqual([])
  })
})

describe('buildRenderList', () => {
  it('emits every mark in order with original flat displayIndex', () => {
    const groups = buildTurnGroups([m('a', 1), m('b', 1), m('c', 2)])
    expect(buildRenderList(groups, new Set())).toEqual({
      items: [
        { mark: m('a', 1), displayIndex: 0 },
        { mark: m('b', 1), displayIndex: 1 },
        { mark: m('c', 2), displayIndex: 2 },
      ],
      separatorsAt: [2],
    })
  })

  it('places a separator at each non-first group boundary', () => {
    const groups = buildTurnGroups([m('a', 1), m('b', 2), m('c', 3)])
    expect(buildRenderList(groups, new Set()).separatorsAt).toEqual([1, 2])
  })

  it('keeps only the last mark of a collapsed turn', () => {
    const groups = buildTurnGroups([m('a', 1), m('b', 1), m('c', 2)])
    expect(buildRenderList(groups, new Set([1]))).toEqual({
      items: [
        { mark: m('b', 1), displayIndex: 1 },
        { mark: m('c', 2), displayIndex: 2 },
      ],
      separatorsAt: [1],
    })
  })

  it('keeps the single mark of a collapsed one-dot group', () => {
    const groups = buildTurnGroups([m('a', 1), m('b', 2)])
    expect(buildRenderList(groups, new Set([1, 2]))).toEqual({
      items: [
        { mark: m('a', 1), displayIndex: 0 },
        { mark: m('b', 2), displayIndex: 1 },
      ],
      separatorsAt: [1],
    })
  })

  it('is a no-op when the collapsed turn never appears', () => {
    const groups = buildTurnGroups([m('a', 1), m('b', 2)])
    expect(buildRenderList(groups, new Set([99]))).toEqual({
      items: [
        { mark: m('a', 1), displayIndex: 0 },
        { mark: m('b', 2), displayIndex: 1 },
      ],
      separatorsAt: [1],
    })
  })

  it('preserves original flat indices across collapsed and undefined-turn groups', () => {
    // full stream: a=0 b=1 c=2 d=3
    const groups = buildTurnGroups([m('a', 1), m('b', 1), m('c'), m('d', 2)])
    expect(buildRenderList(groups, new Set([1]))).toEqual({
      items: [
        { mark: m('b', 1), displayIndex: 1 },
        { mark: m('c'), displayIndex: 2 },
        { mark: m('d', 2), displayIndex: 3 },
      ],
      separatorsAt: [1, 2],
    })
  })

  it('returns empty items and separators for empty groups', () => {
    expect(buildRenderList([], new Set())).toEqual({ items: [], separatorsAt: [] })
  })
})
