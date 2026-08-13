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
