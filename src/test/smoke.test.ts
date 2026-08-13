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

  it('boots the toolchain', () => {
    expect(true).toBe(true)
  })
})
