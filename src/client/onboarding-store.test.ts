/**
 * Unit tests for onboarding-store: the 0.6.4 first-run tutorial flag.
 *
 * Contract under test:
 *   - readOnboardedFlag ⇔ stored value is EXACTLY the string '1'; absent /
 *     '0' / 'true' / garbage all mean "never shown" → false
 *   - writeOnboardedFlag stores the literal '1' (overwriting anything)
 *   - both accessors swallow storage failures (SSR / sandboxed iframe /
 *     quota): a throwing Storage must never propagate
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ONBOARDED_KEY, readOnboardedFlag, writeOnboardedFlag } from './onboarding-store'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Full Storage surface over a Map (mirrors the component-test helpers). */
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

/** A Storage whose every access throws — simulates a sandboxed iframe. */
function throwingStorage(): Storage {
  const deny = (): never => {
    throw new Error('storage denied')
  }
  return {
    get length() {
      return 0
    },
    clear: deny,
    getItem: deny,
    key: () => null,
    removeItem: deny,
    setItem: deny,
  }
}

describe('onboarding-store readOnboardedFlag', () => {
  it('absent key means never shown', () => {
    vi.stubGlobal('localStorage', createStorage(new Map()))
    expect(readOnboardedFlag()).toBe(false)
  })

  it("the exact stored string '1' means seen", () => {
    const backing = new Map<string, string>([[ONBOARDED_KEY, '1']])
    vi.stubGlobal('localStorage', createStorage(backing))
    expect(readOnboardedFlag()).toBe(true)
  })

  it("anything else ('0', 'true', garbage) means never shown", () => {
    for (const value of ['0', 'true', 'yes', 'abc', ' 1 ']) {
      vi.stubGlobal('localStorage', createStorage(new Map<string, string>([[ONBOARDED_KEY, value]])))
      expect(readOnboardedFlag(), `value ${JSON.stringify(value)} must not count as seen`).toBe(false)
    }
  })

  it('a throwing storage degrades to false instead of crashing', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(readOnboardedFlag()).toBe(false)
  })
})

describe('onboarding-store writeOnboardedFlag', () => {
  it('stores the literal string 1', () => {
    const backing = new Map<string, string>()
    vi.stubGlobal('localStorage', createStorage(backing))
    writeOnboardedFlag()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('overwrites a previous non-seen value', () => {
    const backing = new Map<string, string>([[ONBOARDED_KEY, '0']])
    vi.stubGlobal('localStorage', createStorage(backing))
    writeOnboardedFlag()
    expect(backing.get(ONBOARDED_KEY)).toBe('1')
  })

  it('a throwing storage is swallowed (never propagates)', () => {
    vi.stubGlobal('localStorage', throwingStorage())
    expect(() => writeOnboardedFlag()).not.toThrow()
  })

  it('write → read round-trips to true', () => {
    vi.stubGlobal('localStorage', createStorage(new Map()))
    writeOnboardedFlag()
    expect(readOnboardedFlag()).toBe(true)
  })
})