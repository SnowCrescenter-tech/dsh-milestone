/**
 * Unit tests for the pure tooltip-logic module (turn metadata derivation:
 * model/purpose/usage tokens for a turn's hover tooltip). No React, no DOM.
 */
import { describe, it, expect } from 'vitest'
import { deriveTurnMeta } from './tooltip-logic'
import type { TurnMeta } from './tooltip-logic'

const emptyMeta = (): TurnMeta => ({ model: null, purpose: null, inputTokens: null, outputTokens: null })

/** Minimal structural stubs for the deriveTurnMeta inputs. */
function nodeStore(entries: ReadonlyArray<readonly [string, { kind: string; data: unknown }]>) {
  const map = new Map(entries)
  return { get: (key: string): { kind: string; data: unknown } | undefined => map.get(key) }
}

function locIndex(keys: Readonly<Record<number, readonly string[]>>) {
  return { getTurn: (turn: number): readonly string[] => keys[turn] ?? [] }
}

describe('deriveTurnMeta — assistant-step finalNode path', () => {
  it('reads model/purpose/tokens from the assistant-step data.finalNode', () => {
    const node = {
      kind: 'assistant-step',
      data: {
        finalNode: {
          requestConfig: { provider: 'p', model: 'deepseek-r1', purpose: 'reply' },
          provenance: { provider: 'p', model: 'deepseek-r1' },
          usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
        },
      },
    }
    expect(deriveTurnMeta(nodeStore([['a1', node]]), locIndex({ 3: ['a1'] }), 3)).toEqual({
      model: 'deepseek-r1',
      purpose: 'reply',
      inputTokens: 100,
      outputTokens: 50,
    })
  })

  it('falls back to provenance.model when requestConfig has no model', () => {
    const node = {
      kind: 'assistant-step',
      data: {
        finalNode: {
          provenance: { provider: 'p', model: 'r2' },
          usage: { inputTokens: 5, outputTokens: 2 },
        },
      },
    }
    expect(deriveTurnMeta(nodeStore([['a1', node]]), locIndex({ 4: ['a1'] }), 4).model).toBe('r2')
  })

  it('prefers requestConfig.model over provenance.model when both differ', () => {
    const node = {
      kind: 'assistant-step',
      data: {
        finalNode: {
          requestConfig: { provider: 'p', model: 'cfg-model' },
          provenance: { provider: 'p', model: 'prov-model' },
        },
      },
    }
    expect(deriveTurnMeta(nodeStore([['a1', node]]), locIndex({ 1: ['a1'] }), 1).model).toBe('cfg-model')
  })

  it('skips non-assistant-step nodes but still finds the assistant step', () => {
    const userNode = { kind: 'user', data: null }
    const assistantNode = {
      kind: 'assistant-step',
      data: {
        finalNode: {
          provenance: { provider: 'p', model: 'deepseek-r1' },
          usage: { inputTokens: 10, outputTokens: 4 },
        },
      },
    }
    expect(deriveTurnMeta(nodeStore([['u1', userNode], ['a1', assistantNode]]), locIndex({ 2: ['u1', 'a1'] }), 2)).toEqual({
      model: 'deepseek-r1',
      purpose: null,
      inputTokens: 10,
      outputTokens: 4,
    })
  })
})

describe('deriveTurnMeta — trajectory fallback', () => {
  it('falls back to the latest matching trajectory request when no assistant-step yields model/purpose', () => {
    // assistant-step exists but finalNode carries only usage (no model/purpose)
    const node = {
      kind: 'assistant-step',
      data: { finalNode: { usage: { inputTokens: 9, outputTokens: 1 } } },
    }
    const trajectory = [
      { turn: 5, requestConfig: { provider: 'p', model: 'traj-model', purpose: 'traj-purpose' }, usage: { inputTokens: 7, outputTokens: 3 } },
    ]
    expect(deriveTurnMeta(nodeStore([['a1', node]]), locIndex({ 5: ['a1'] }), 5, trajectory)).toEqual({
      model: 'traj-model',
      purpose: 'traj-purpose',
      inputTokens: 7,
      outputTokens: 3,
    })
  })

  it('uses the latest trajectory request for the turn', () => {
    const trajectory = [
      { turn: 5, requestConfig: { provider: 'p', model: 'old-model' } },
      { turn: 6, requestConfig: { provider: 'p', model: 'wrong-turn' } },
      { turn: 5, requestConfig: { provider: 'p', model: 'new-model' } },
    ]
    expect(deriveTurnMeta(nodeStore([]), locIndex({}), 5, trajectory).model).toBe('new-model')
  })

  it('falls back to provenance.model inside the trajectory request', () => {
    const trajectory = [
      { turn: 2, provenance: { provider: 'p', model: 'prov-model' }, usage: { inputTokens: 1, outputTokens: 1 } },
    ]
    expect(deriveTurnMeta(nodeStore([]), locIndex({}), 2, trajectory)).toEqual({
      model: 'prov-model',
      purpose: null,
      inputTokens: 1,
      outputTokens: 1,
    })
  })

  it('returns all nulls when no trajectory request matches the turn', () => {
    const trajectory = [{ turn: 99, requestConfig: { provider: 'p', model: 'other' } }]
    expect(deriveTurnMeta(nodeStore([]), locIndex({}), 7, trajectory)).toEqual(emptyMeta())
  })
})

describe('deriveTurnMeta — usage decoding', () => {
  it('treats malformed usage as null tokens (non-object, non-number fields)', () => {
    const cases: unknown[] = [
      'not-an-object',
      null,
      { inputTokens: 'ten', outputTokens: 20 },
      { inputTokens: 10, outputTokens: undefined },
      {},
    ]
    const node = { kind: 'assistant-step', data: { finalNode: { usage: 'seed' } } }
    for (const usage of cases) {
      const withUsage = { kind: 'assistant-step', data: { finalNode: { usage } } }
      const meta = deriveTurnMeta(nodeStore([['a1', withUsage]]), locIndex({ 1: ['a1'] }), 1)
      expect(meta.inputTokens).toBeNull()
      expect(meta.outputTokens).toBeNull()
    }
    expect(node).toBeDefined()
  })
})

describe('deriveTurnMeta — absence and garbage', () => {
  it('returns all nulls when turn is undefined', () => {
    const trajectory = [{ turn: 1, requestConfig: { provider: 'p', model: 'x' } }]
    expect(deriveTurnMeta(nodeStore([]), locIndex({}), undefined, trajectory)).toEqual(emptyMeta())
  })

  it('returns all nulls when no nodes are present for the turn', () => {
    expect(deriveTurnMeta(nodeStore([]), locIndex({}), 1)).toEqual(emptyMeta())
    expect(deriveTurnMeta(nodeStore([]), locIndex({ 1: [] }), 1)).toEqual(emptyMeta())
  })

  it('returns all nulls when every key resolves to undefined or non-assistant nodes', () => {
    expect(deriveTurnMeta(nodeStore([['u1', { kind: 'user', data: null }]]), locIndex({ 1: ['u1', 'ghost'] }), 1)).toEqual(emptyMeta())
  })

  it('never throws on garbage data and yields nulls', () => {
    const garbageNodes = [
      { kind: 'assistant-step', data: null },
      { kind: 'assistant-step', data: 'junk' },
      { kind: 'assistant-step', data: {} },
      { kind: 'assistant-step', data: { finalNode: 'junk' } },
    ]
    for (const node of garbageNodes) {
      expect(deriveTurnMeta(nodeStore([['a1', node]]), locIndex({ 1: ['a1'] }), 1)).toEqual(emptyMeta())
    }
  })
})
