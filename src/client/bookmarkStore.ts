/**
 * Persisted per-session bookmarks store for the milestone rail.
 *
 * A thin declarative shell over the harness snapshot-store engine: pure
 * draft-mutator actions, persisted to localStorage under the key
 * `dsh-milestone.bookmarks` (+ `.${scopeKey}` for session-scope instances,
 * resolved by the engine's `create(scopeKey)`). Consumers must call the
 * FACTORY (never a module-level handle — module-cache identity is a disguised
 * singleton across plugin reloads).
 */
import { defineStore } from '@deepseek-ai/dsh-client-runtime/client'
import { toggleKey } from './bookmark-logic'

/** Store state: the bookmark key list, in toggle order. */
interface BookmarksState {
  keys: string[]
}

/**
 * Declare the bookmarks store handle. Returns a fresh handle per call; the
 * framework (or tests) create per-session instances via `create(scopeKey)`.
 */
export function createBookmarksStore() {
  return defineStore({
    init: (): BookmarksState => ({ keys: [] }),
    persist: 'dsh-milestone.bookmarks',
    actions: {
      toggle: (draft, key: string) => {
        draft.keys = toggleKey(draft.keys, key)
      },
      clear: (draft) => {
        draft.keys = []
      },
    },
  })
}
