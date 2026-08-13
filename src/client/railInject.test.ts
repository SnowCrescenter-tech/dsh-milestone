import { describe, it, expect, vi } from 'vitest'
import { createLoadOlder } from './railInject'

/**
 * Structural sessions double matching `SessionsLike`: a real binding only for
 * `id === 's1'`; every other id resolves to `undefined` (unlisted session).
 */
function makeSessions() {
  const loadOlder = vi.fn(async () => {})
  const binding = vi.fn((id: string) =>
    id === 's1' ? { session: { loadOlder } } : undefined,
  )
  return { sessions: { binding }, binding, loadOlder }
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
