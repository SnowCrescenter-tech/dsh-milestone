/**
 * Engine-level tests for the persisted bookmarks store. Exercises the REAL
 * defineStore engine shipped by @deepseek-ai/dsh-client-runtime/client — the
 * persistence, immer-draft actions, and scope-key suffixing are the genuine
 * bundled code, never mocked.
 *
 * The runtime ships its client half as a browser closure bundle
 * (`window.__ModuleLoader__.load({ factory })`, the harness loader's dialect)
 * that vitest has no loader for and whose CJS interop exposes no exports. So
 * this file evaluates the real bundle source directly (capturing its true
 * `module.exports`) and routes the import back to that captured engine — the
 * loader shell is the only thing simulated. Only localStorage is stubbed per
 * test (fresh Map-backed object) so persistence is observable and isolated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
// The bundle source, imported as raw text via Vite's `?raw` query (no node
// builtins — TypeScript 6 does not auto-include @types/node in this project).
import bundleSrc from '@deepseek-ai/dsh-client-runtime/client?raw'

const PERSIST_KEY = 'dsh-milestone.bookmarks'
const SESSION_KEY = 'dsh-milestone.bookmarks.s1'

// Captured real bundle exports, shared between the eval below and the vi.mock
// factory (which runs later, at first import of the runtime module).
const captured = () => (globalThis as unknown as { __RUNTIME_EXPORTS__: Record<string, unknown> }).__RUNTIME_EXPORTS__

// Load the closure bundle's two synchronous dependencies up front (genuine
// installed modules), then evaluate the bundle source: its top-level
// `window.__ModuleLoader__.load(...)` is answered by the shim below, whose
// load() returns the factory's module.exports — the bundle's real exports.
const [cordisNS, uiSlotsNS] = await Promise.all([
  import('@deepseek-ai/cordis'),
  import('@deepseek-ai/dsh-client-ui-slots'),
])
const requireShim = (id: string): unknown => {
  if (id === '@deepseek-ai/cordis') return cordisNS
  if (id === '@deepseek-ai/dsh-client-ui-slots') return uiSlotsNS
  throw new Error(`bookmarkStore.test loader: unexpected require("${id}")`)
}
// Evaluate the bundle source in a plain function scope. `new Function` runs in
// the true global realm (distinct from the ESM module realm), so the loader
// shim must be installed on THAT realm's `window` — inside the eval body. The
// shim's load() returns the factory's module.exports (the real exports), and
// the bundle's single top-level `window.__ModuleLoader__.load({...})` call is
// made an explicit `return` so this function hands the exports back.
;(globalThis as unknown as { __RUNTIME_EXPORTS__: Record<string, unknown> }).__RUNTIME_EXPORTS__ =
  new Function(
    'require',
    `window.__ModuleLoader__ = { load: (entry) => entry.factory(require) };\nreturn ` + bundleSrc,
  )(requireShim) as Record<string, unknown>

// Route the store's import of the bundle to the captured real engine (vite
// would otherwise give an empty namespace for the closure bundle). The mock
// factory defers to first import, by which time the capture above ran.
vi.mock('@deepseek-ai/dsh-client-runtime/client', () => captured())

const { createBookmarksStore } = await import('./bookmarkStore')

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
