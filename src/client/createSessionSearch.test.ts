import { describe, expect, it, vi } from 'vitest'
import { createOpenSession, createSessionSearch } from './railInject'
import type { SessionSearchLike, SessionSearchRpcResult } from './railInject'

/**
 * Structural sessions double matching the `search`/`open`/`list` face:
 * `search` resolves the configured RpcResult (default: an empty ok result),
 * `list.getSnapshot` reads the configured session-row map, and `open`
 * records calls.
 */
function makeSessions(options: {
  result?:
    | { ok: true; value: { items: Array<{ sessionId: string; snippet: string }>; hasMore: boolean } }
    | { ok: false; error: { message: string } }
  byId?: Record<string, { displayTitle: string }>
  reject?: unknown
} = {}) {
  const open = vi.fn()
  const listGet = vi.fn(() => ({ byId: options.byId ?? {} }))
  const search = vi.fn(async (_query: string, _signal: AbortSignal): Promise<SessionSearchRpcResult> => {
    if (options.reject !== undefined) throw options.reject
    return options.result ?? { ok: true, value: { items: [], hasMore: false } }
  })
  const sessions: SessionSearchLike = { search, open, list: { getSnapshot: listGet } }
  return { sessions, search, open, listGet }
}

describe('createSessionSearch', () => {
  it('unwraps an ok result and joins each hit with its display title from the session list', async () => {
    const { sessions, search, listGet } = makeSessions({
      byId: {
        s1: { displayTitle: '会话一' },
        s2: { displayTitle: '会话二' },
      },
      result: {
        ok: true,
        value: {
          items: [
            { sessionId: 's1', snippet: '…snippet-1…' },
            { sessionId: 's2', snippet: '…snippet-2…' },
            // Not in the list store — the title must stay undefined.
            { sessionId: 's3', snippet: '…snippet-3…' },
          ],
          hasMore: true,
        },
      },
    })
    const searchSessions = createSessionSearch(sessions)

    await expect(searchSessions('rust', new AbortController().signal)).resolves.toEqual({
      items: [
        { sessionId: 's1', snippet: '…snippet-1…', title: '会话一' },
        { sessionId: 's2', snippet: '…snippet-2…', title: '会话二' },
        { sessionId: 's3', snippet: '…snippet-3…', title: undefined },
      ],
      hasMore: true,
    })

    expect(search).toHaveBeenCalledTimes(1)
    // The list store is read synchronously once per search.
    expect(listGet).toHaveBeenCalledTimes(1)
  })

  it('forwards the query and the abort signal to the RPC', async () => {
    const { sessions, search } = makeSessions()
    const signal = new AbortController().signal
    const searchSessions = createSessionSearch(sessions)

    await searchSessions('sql', signal)

    expect(search).toHaveBeenCalledWith('sql', signal)
  })

  it('throws the RPC error message when the result is ok: false', async () => {
    const { sessions } = makeSessions({
      result: { ok: false, error: { message: 'search unavailable' } },
    })
    const searchSessions = createSessionSearch(sessions)

    await expect(searchSessions('rust', new AbortController().signal)).rejects.toThrow('search unavailable')
  })

  it('propagates a rejected RPC unchanged', async () => {
    const { sessions } = makeSessions({ reject: new Error('transport down') })
    const searchSessions = createSessionSearch(sessions)

    await expect(searchSessions('rust', new AbortController().signal)).rejects.toThrow('transport down')
  })
})

describe('createOpenSession', () => {
  it('delegates to sessions.open with the given id', () => {
    const { sessions, open } = makeSessions()

    createOpenSession(sessions)('s1')

    expect(open).toHaveBeenCalledTimes(1)
    expect(open).toHaveBeenCalledWith('s1')
  })
})
