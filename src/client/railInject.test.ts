import { describe, it, expect, vi } from 'vitest'
import { createForkAt, createLoadOlder } from './railInject'

/**
 * Structural sessions double matching `SessionsLike`: a real binding only for
 * `id === 's1'`; every other id resolves to `undefined` (unlisted session).
 * `fork` resolves a stable child id, overridable per test.
 */
function makeSessions() {
  const loadOlder = vi.fn(async () => {})
  const binding = vi.fn((id: string) =>
    id === 's1' ? { session: { loadOlder } } : undefined,
  )
  const fork = vi.fn(async () => 'child-1')
  return { sessions: { binding, fork }, binding, loadOlder, fork }
}

describe('createLoadOlder', () => {
  it('invokes the bound session loadOlder exactly once and resolves when binding resolves a session', async () => {
    const { sessions, binding, loadOlder } = makeSessions()
    const loadOlderFor = createLoadOlder(sessions, 's1')

    await expect(loadOlderFor()).resolves.toBeUndefined()

    expect(binding).toHaveBeenCalledTimes(1)
    expect(binding).toHaveBeenCalledWith('s1')
    expect(loadOlder).toHaveBeenCalledTimes(1)
  })

  it('resolves without throwing and never calls loadOlder when binding returns undefined', async () => {
    const { sessions, binding, loadOlder } = makeSessions()
    const loadOlderFor = createLoadOlder(sessions, 'missing')

    await expect(loadOlderFor()).resolves.toBeUndefined()

    expect(binding).toHaveBeenCalledTimes(1)
    expect(binding).toHaveBeenCalledWith('missing')
    expect(loadOlder).not.toHaveBeenCalled()
  })

  it('propagates the original rejection when loadOlder rejects', async () => {
    const { sessions, binding, loadOlder } = makeSessions()
    const error = new Error('load older failed')
    loadOlder.mockRejectedValueOnce(error)
    const loadOlderFor = createLoadOlder(sessions, 's1')

    await expect(loadOlderFor()).rejects.toBe(error)

    expect(loadOlder).toHaveBeenCalledTimes(1)
  })
})

describe('createForkAt', () => {
  it('forks the scoped session at the given seq with increaseTitle: true and resolves the child id', async () => {
    const { sessions, fork } = makeSessions()
    const forkAt = createForkAt(sessions, 's1')

    await expect(forkAt(42)).resolves.toBe('child-1')

    expect(fork).toHaveBeenCalledTimes(1)
    expect(fork).toHaveBeenCalledWith({ sessionId: 's1', atSeq: 42, increaseTitle: true })
  })

  it('propagates the original rejection when fork rejects', async () => {
    const { sessions, fork } = makeSessions()
    const error = new Error('fork failed')
    fork.mockRejectedValueOnce(error)
    const forkAt = createForkAt(sessions, 's1')

    await expect(forkAt(7)).rejects.toBe(error)

    expect(fork).toHaveBeenCalledTimes(1)
    expect(fork).toHaveBeenCalledWith({ sessionId: 's1', atSeq: 7, increaseTitle: true })
  })
})
