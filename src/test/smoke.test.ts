/**
 * Toolchain smoke test: proves vitest boots, jsdom loads, and the
 * ConversationSnapshot fixture yields user-message marks the way the real
 * harness snapshot does (chat.order + chat.nodes.get(key)).
 */
import { describe, expect, it } from 'vitest'
import { buildSnapshot } from './snapshot-fixture.ts'

const USERS = [
  { key: '13:user<smoke-1>', seq: 1, time: 1_700_000_000_000, text: '第一条提问' },
  { key: '13:user<smoke-2>', seq: 2, time: 1_700_000_060_000, text: '第二条提问' },
]

describe('buildSnapshot', () => {
  it('orders chat.order to match the user list', () => {
    const snapshot = buildSnapshot({ users: USERS })
    expect(snapshot.chat.order.length).toBe(USERS.length)
    expect(snapshot.chat.order).toEqual(USERS.map((u) => u.key))
  })

  it('serves user nodes through the Map-backed store', () => {
    const snapshot = buildSnapshot({ users: USERS })
    expect(snapshot.chat.nodes.get(USERS[0].key)?.kind).toBe('user')
    expect(snapshot.chat.nodes.get('missing')).toBeUndefined()
    expect(snapshot.chat.nodes.values().length).toBe(USERS.length)
  })

  it('defaults to at least two user-message marks', () => {
    const snapshot = buildSnapshot()
    expect(snapshot.chat.order.length).toBeGreaterThanOrEqual(2)
  })

  it('stamps extra turn-health nodes into order and the store', () => {
    const extras = [
      { key: '13:turn-error<e1>', kind: 'turn-error', turn: 1 },
      { key: '13:turn-max-tokens<m1>', kind: 'turn-max-tokens', turn: 2, retryState: 'retrying' },
      { key: '13:model-retry<r1>', kind: 'model-retry', turn: 3 },
    ]
    const snapshot = buildSnapshot({ users: USERS, nodes: extras })
    expect(snapshot.chat.order).toEqual([...USERS.map((u) => u.key), ...extras.map((e) => e.key)])
    expect(snapshot.chat.nodes.get('13:turn-error<e1>')?.kind).toBe('turn-error')
    expect(snapshot.chat.nodes.get('13:turn-max-tokens<m1>')?.kind).toBe('turn-max-tokens')
    expect(snapshot.chat.nodes.get('13:model-retry<r1>')?.kind).toBe('model-retry')
  })

  it('keeps default top-level flags inert', () => {
    const snapshot = buildSnapshot({ users: USERS })
    expect(snapshot.running).toBe(false)
    expect(snapshot.pending).toEqual([])
    expect(snapshot.partial).toBeNull()
  })

  it('honours explicit pending/running/partial stamps', () => {
    const snapshot = buildSnapshot({ users: USERS, pending: true, running: true, partial: true })
    expect(snapshot.running).toBe(true)
    expect(snapshot.pending.length).toBeGreaterThan(0)
    expect(snapshot.partial).not.toBeNull()
  })

  it('boots the toolchain', () => {
    expect(true).toBe(true)
  })
})
