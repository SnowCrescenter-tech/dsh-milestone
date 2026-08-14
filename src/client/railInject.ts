/**
 * Binding-safe `loadOlder` action for the milestone rail.
 *
 * `createLoadOlder` lives here, decoupled from any harness runtime value, so
 * tsdown can bundle `lib/client.js` without importing the sessions service.
 * The structural `SessionsLike` matches the runtime `ISessions` face exactly:
 * `ctx.sessions.binding(id)` returns a `SessionBinding | undefined` (a session
 * neither listed nor scoped resolves to `undefined`), and the binding's
 * `session.loadOlder(): Promise<void>` loads the previous message page.
 */

/** Structural sessions-service face — mirrors the harness `ISessions` contract for `binding` and `fork`. */
export interface SessionsLike {
  binding(id: string): { session: { loadOlder(): Promise<unknown> } } | undefined
  fork(opts: { sessionId: string; atSeq?: number; increaseTitle?: boolean }): Promise<string>
}

/** One cross-session search hit: the harness's `session.search` RPC item. */
export interface SessionSearchResultItemLike {
  sessionId: string
  snippet: string
}

/** The RpcResult shape the `session.search` RPC resolves (ok value / error message). */
export type SessionSearchRpcResult = {
  ok: true
  value: { items: SessionSearchResultItemLike[]; hasMore: boolean }
} | { ok: false; error: { message: string } }

/**
 * Structural sessions-service face — the `search`/`open`/`list` slice of the
 * harness `ISessions` contract: `search` is a cancellable one-shot RPC over
 * the host's visible message-content index, `open` selects a listed session
 * as current (the same path the sidebar uses), and `list.getSnapshot()`
 * synchronously reads the session-row map for display-title joining.
 */
export interface SessionSearchLike {
  search(query: string, signal: AbortSignal): Promise<SessionSearchRpcResult>
  open(id: string): void
  list: { getSnapshot(): { byId: Record<string, { displayTitle: string }> } }
}

/**
 * Wrap the `session.search` RPC into a safe cross-session search action.
 *
 * - `ok: true` unwraps the value and joins each hit's human display title
 *   from the session list snapshot (a session outside the list keeps no
 *   title — the caller falls back to `search.untitled`).
 * - `ok: false` throws `new Error(error.message)` so the caller can surface
 *   the business/transport error as the `search.error` state.
 * - A rejected RPC propagates unchanged.
 *
 * The list read happens inside the returned closure (never at factory time),
 * so the title join always reflects the current list snapshot.
 *
 * @param sessions - the injected sessions service (`ctx.sessions`).
 * @returns an action that searches all sessions' message content.
 */
export function createSessionSearch(
  sessions: SessionSearchLike,
): (query: string, signal: AbortSignal) => Promise<{ items: (SessionSearchResultItemLike & { title?: string })[]; hasMore: boolean }> {
  return async (query, signal) => {
    const result = await sessions.search(query, signal)
    if (!result.ok) throw new Error(result.error.message)
    const byId = sessions.list.getSnapshot().byId
    return {
      items: result.value.items.map((item) => ({
        ...item,
        title: byId[item.sessionId]?.displayTitle,
      })),
      hasMore: result.value.hasMore,
    }
  }
}

/**
 * Wrap a session `open` call into a safe action that selects a listed session
 * as current — the exact selection path the sidebar uses on click.
 *
 * @param sessions - the injected sessions service (`ctx.sessions`).
 * @returns an action that opens the given session.
 */
export function createOpenSession(sessions: SessionSearchLike): (id: string) => void {
  return (id) => sessions.open(id)
}

/**
 * Wrap a session-bound `loadOlder` call into a safe action closure.
 *
 * - Missing binding: resolves (never throws on an unlisted/unscoped session).
 * - Bound session: delegates to `session.loadOlder()`; a rejection propagates
 *   unchanged so callers can surface the transport error.
 *
 * @param sessions - the injected sessions service (`ctx.sessions`).
 * @param sessionId - the session the rail is scoped to.
 * @returns an action that loads the previous message page for that session.
 */
export function createLoadOlder(sessions: SessionsLike, sessionId: string): () => Promise<void> {
  return async () => {
    const binding = sessions.binding(sessionId)
    if (binding === undefined) return
    await binding.session.loadOlder()
  }
}

/**
 * Wrap a session `fork` call into a safe action closure that anchors the cut
 * at an event seq and always bumps the inherited title.
 *
 * - Delegates to `sessions.fork({ sessionId, atSeq, increaseTitle: true })`;
 *   the resolved child id is passed through.
 * - A rejection propagates unchanged so callers can surface the fork error.
 *
 * @param sessions - the injected sessions service (`ctx.sessions`).
 * @param sessionId - the session the rail is scoped to.
 * @returns an action that forks that session at a given event seq.
 */
export function createForkAt(sessions: SessionsLike, sessionId: string): (atSeq: number) => Promise<string> {
  return (atSeq) => sessions.fork({ sessionId, atSeq, increaseTitle: true })
}
