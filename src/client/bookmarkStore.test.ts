/**
 * Engine-level tests for the persisted bookmarks store. Exercises the REAL
 * defineStore engine shipped by @deepseek-ai/dsh-client-runtime/client — the
 * persistence, immer-draft actions, and scope-key suffixing are the genuine
 * bundled code, never mocked.
 *
 * The runtime's client subpath is aliased (vitest.config.ts) to a test shim
 * (`src/test/runtime-client.ts`) that evaluates the real closure bundle and
 * re-exports its engine, so `bookmarkStore.ts`'s `defineStore` import is the
 * true engine. Only localStorage is stubbed per test (fresh Map-backed object)
 * so persistence is observable and isolated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBookmarksStore } from './bookmarkStore'

const PERSIST_KEY = 'dsh-milestone.bookmarks'
const SESSION_KEY = 'dsh-milestone.bookmarks.s1'

/** Full Storage surface (getItem/setItem/removeItem/clear/key/length) over a Map. */
function createStorage(backing: Map<string, string>): Storage {
  return {
    get length() {
      return backing.size
    },
    clear: () => {
      backing.clear()
    },
    getItem: (k: string) => backing.get(k) ?? null,
    key: (index: number) => [...backing.keys()][index] ?? null,
    removeItem: (k: string) => {
      backing.delete(k)
    },
    setItem: (k: string, v: string) => {
      backing.set(k, v)
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('createBookmarksStore', () => {
  it('starts with no bookmarks for a fresh session', () => {
    vi.stubGlobal('localStorage', createStorage(new Map()))
    const inst = createBookmarksStore().create('s1')
    expect(inst.getSnapshot()).toEqual({ keys: [] })
  })

  it('toggle persists under the scope-suffixed key with the exact key format', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', createStorage(backing))
    const inst = createBookmarksStore().create('s1')
    inst.actions.toggle('k1')
    expect(backing.has(SESSION_KEY)).toBe(true)
    expect(JSON.parse(backing.get(SESSION_KEY)!)).toEqual({ keys: ['k1'] })
  })

  it('toggle off removes the key from the persisted snapshot', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', createStorage(backing))
    const inst = createBookmarksStore().create('s1')
    inst.actions.toggle('k1')
    inst.actions.toggle('k1')
    expect(JSON.parse(backing.get(SESSION_KEY)!)).toEqual({ keys: [] })
  })

  it('a second create over the same backing rehydrates the keys (survives reload)', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', createStorage(backing))
    const first = createBookmarksStore().create('s1')
    first.actions.toggle('k1')
    first.actions.toggle('k2')
    const revived = createBookmarksStore().create('s1')
    expect(revived.getSnapshot()).toEqual({ keys: ['k1', 'k2'] })
    expect(backing.get(SESSION_KEY)).toBe(JSON.stringify({ keys: ['k1', 'k2'] }))
  })

  it('clear resets the persisted keys to none', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', createStorage(backing))
    const inst = createBookmarksStore().create('s1')
    inst.actions.toggle('k1')
    inst.actions.toggle('k2')
    inst.actions.clear()
    expect(inst.getSnapshot()).toEqual({ keys: [] })
    expect(JSON.parse(backing.get(SESSION_KEY)!)).toEqual({ keys: [] })
  })

  it('create() without a scope key persists under the bare key', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', createStorage(backing))
    createBookmarksStore().create().actions.toggle('k0')
    expect(backing.has(PERSIST_KEY)).toBe(true)
    expect(JSON.parse(backing.get(PERSIST_KEY)!)).toEqual({ keys: ['k0'] })
  })

  it('clearPersisted removes exactly the session key, leaving siblings intact', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', createStorage(backing))
    const s1 = createBookmarksStore().create('s1')
    createBookmarksStore().create('s2').actions.toggle('k2')
    createBookmarksStore().create().actions.toggle('k0')
    s1.actions.toggle('k1')
    s1.clearPersisted()
    expect(backing.has(SESSION_KEY)).toBe(false)
    expect(backing.has('dsh-milestone.bookmarks.s2')).toBe(true)
    expect(backing.has(PERSIST_KEY)).toBe(true)
  })
})
