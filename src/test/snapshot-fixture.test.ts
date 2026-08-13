/**
 * Tests for the extended snapshot fixture: per-turn assistant metadata stamps
 * (`assistants`), turn-location overrides (`userTurns`), the ui-trajectory
 * view payload (`trajectory`), and the derived `chat.locations.getTurn` /
 * `chat.timeline.turnOrder` indexes. The legacy option surface (users/nodes/
 * pending/running/partial/...) is already covered by smoke.test.ts and must
 * keep passing unchanged.
 */
import { describe, expect, it } from 'vitest'
import { buildSnapshot } from './snapshot-fixture.ts'

const USERS = [
  { key: '13:user<msg-1>', seq: 1, time: 1_700_000_000_000, text: '第一条提问' },
  { key: '13:user<msg-2>', seq: 2, time: 1_700_000_060_000, text: '第二条提问' },
]

describe('buildSnapshot — userTurns', () => {
  it('defaults each user node to its 1-based position turn', () => {
    const snapshot = buildSnapshot({ users: USERS })
    expect(snapshot.chat.nodes.get('13:user<msg-1>')?.location.turn.turn).toBe(1)
    expect(snapshot.chat.nodes.get('13:user<msg-2>')?.location.turn.turn).toBe(2)
  })

  it('stamps explicit turn numbers onto user node locations', () => {
    const snapshot = buildSnapshot({ users: USERS, userTurns: [5, 7] })
    expect(snapshot.chat.nodes.get('13:user<msg-1>')?.location.turn.turn).toBe(5)
    expect(snapshot.chat.nodes.get('13:user<msg-2>')?.location.turn.turn).toBe(7)
  })

  it('derives turnOrder from first-seen userTurns, deduped', () => {
    const snapshot = buildSnapshot({ users: USERS, userTurns: [4, 4, 9] })
    expect(snapshot.chat.timeline.turnOrder).toEqual([4, 9])
  })
})

describe('buildSnapshot — getTurn location index', () => {
  it('returns user keys for a turn in node order', () => {
    const snapshot = buildSnapshot({ users: USERS })
    expect(snapshot.chat.locations.getTurn(1)).toEqual(['13:user<msg-1>'])
    expect(snapshot.chat.locations.getTurn(2)).toEqual(['13:user<msg-2>'])
  })

  it('returns empty for a turn with no nodes', () => {
    const snapshot = buildSnapshot({ users: USERS })
    expect(snapshot.chat.locations.getTurn(99)).toEqual([])
  })

  it('includes extra nodes and assistant nodes alongside users for the turn', () => {
    const snapshot = buildSnapshot({
      users: USERS,
      userTurns: [1, 2],
      nodes: [{ key: '13:turn-error<e1>', kind: 'turn-error', turn: 1 }],
      assistants: [{ key: '13:assistant-step<a1>', turn: 1 }],
    })
    expect(snapshot.chat.locations.getTurn(1)).toEqual([
      '13:user<msg-1>',
      '13:turn-error<e1>',
      '13:assistant-step<a1>',
    ])
  })
})

describe('buildSnapshot — assistant-step nodes', () => {
  it('appends assistant nodes to order and the node store after users/extras', () => {
    const snapshot = buildSnapshot({
      users: USERS,
      nodes: [{ key: '13:model-retry<r1>', kind: 'model-retry', turn: 1 }],
      assistants: [{ key: '13:assistant-step<a1>', turn: 1 }],
    })
    expect(snapshot.chat.order).toEqual(['13:user<msg-1>', '13:user<msg-2>', '13:model-retry<r1>', '13:assistant-step<a1>'])
    expect(snapshot.chat.nodes.get('13:assistant-step<a1>')?.kind).toBe('assistant-step')
  })

  it('stamps settled data with turn/step/time/usage and a finalNode assistant', () => {
    const snapshot = buildSnapshot({
      users: USERS,
      userTurns: [1, 2],
      assistants: [
        {
          key: '13:assistant-step<a1>',
          turn: 1,
          step: 2,
          usage: { inputTokens: 100, outputTokens: 50 },
          provenance: { provider: 'p', model: 'deepseek-r1' },
          requestConfig: { provider: 'p', model: 'deepseek-r1', purpose: 'reply' },
        },
      ],
    })
    const node = snapshot.chat.nodes.get('13:assistant-step<a1>')
    expect(node?.location.turn.turn).toBe(1)
    const data = node?.data as {
      status: string
      turn: number
      step: number
      time: number
      usage?: { inputTokens?: number; outputTokens?: number }
      finalNode: {
        kind: string
        seq: number
        time: number
        turn: number
        step: number
        blocks: readonly unknown[]
        usage?: { inputTokens?: number; outputTokens?: number }
        provenance?: { provider: string; model: string }
        requestConfig?: { provider: string; model: string; purpose?: string }
      }
    }
    expect(data.status).toBe('settled')
    expect(data.turn).toBe(1)
    expect(data.step).toBe(2)
    expect(data.time).toBe(1_700_000_000_000) // mirrors the turn-1 user's time
    expect(data.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
    expect(data.finalNode.kind).toBe('assistant')
    expect(data.finalNode.turn).toBe(1)
    expect(data.finalNode.step).toBe(2)
    expect(data.finalNode.blocks).toEqual([])
    expect(data.finalNode.usage).toEqual({ inputTokens: 100, outputTokens: 50 })
    expect(data.finalNode.provenance).toEqual({ provider: 'p', model: 'deepseek-r1' })
    expect(data.finalNode.requestConfig).toEqual({ provider: 'p', model: 'deepseek-r1', purpose: 'reply' })
  })

  it('defaults step to 1 and omits absent finalNode fields', () => {
    const snapshot = buildSnapshot({ assistants: [{ key: 'a1', turn: 3 }] })
    const data = snapshot.chat.nodes.get('a1')?.data as {
      step: number
      finalNode: { usage?: unknown; provenance?: unknown; requestConfig?: unknown }
    }
    expect(data.step).toBe(1)
    expect(data.finalNode.usage).toBeUndefined()
    expect(data.finalNode.provenance).toBeUndefined()
    expect(data.finalNode.requestConfig).toBeUndefined()
  })
})

describe('buildSnapshot — trajectory view', () => {
  it('serves the requests payload from views.get(trajectory)', () => {
    const requests = [
      {
        turn: 1,
        purpose: 'reply',
        requestConfig: { provider: 'p', model: 'deepseek-r1', purpose: 'reply' },
        provenance: { provider: 'p', model: 'deepseek-r1' },
        usage: { inputTokens: 7, outputTokens: 3 },
      },
      { turn: 2, provenance: { provider: 'p', model: 'other-model' } },
    ]
    const snapshot = buildSnapshot({ trajectory: { requests } })
    const trajectory = snapshot.views.get('trajectory') as { requests: readonly unknown[] }
    expect(trajectory.requests).toHaveLength(2)
    expect(trajectory.requests[0]).toEqual({
      turn: 1,
      purpose: 'reply',
      requestConfig: { provider: 'p', model: 'deepseek-r1', purpose: 'reply' },
      provenance: { provider: 'p', model: 'deepseek-r1' },
      usage: { inputTokens: 7, outputTokens: 3 },
    })
  })

  it('returns an empty requests list when no trajectory is given', () => {
    const snapshot = buildSnapshot({ users: USERS })
    const trajectory = snapshot.views.get('trajectory') as { requests: readonly unknown[] }
    expect(trajectory.requests).toEqual([])
  })

  it('returns undefined for unknown view keys', () => {
    const snapshot = buildSnapshot({ trajectory: { requests: [] } })
    expect(snapshot.views.get('nope')).toBeUndefined()
  })
})
