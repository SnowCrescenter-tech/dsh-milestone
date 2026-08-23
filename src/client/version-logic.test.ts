/**
 * Unit tests for the pure version-logic module: semver comparison, the update
 * predicate, the fetchLatestVersion npmmirror→npm fallback chain (with
 * internal timeout and external abort propagation), and the supported host
 * lines. No React, no DOM; network is stubbed via vi.stubGlobal('fetch').
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  compareVersions,
  fetchLatestVersion,
  loadCachedLatest,
  needsUpdate,
  parseUpdateCache,
  readUpdateCache,
  SUPPORTED_HOST_LINES,
  UPDATE_CACHE_KEY,
  UPDATE_CACHE_TTL_MS,
  writeUpdateCache,
} from './version-logic'

/** Minimal Response-like object; version-logic only reads ok + json(). */
const okJson = (data: unknown): unknown => ({ ok: true, status: 200, json: async () => data })

/** Minimal non-ok Response-like object (HTTP failure). */
const httpError = (status: number): unknown => ({ ok: false, status, json: async () => ({}) })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('compareVersions', () => {
  it('returns 0 for identical versions', () => {
    expect(compareVersions('0.6.0', '0.6.0')).toBe(0)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
  })

  it('pads missing core segments with 0', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1', '1.0.0')).toBe(0)
  })

  it('orders by major, minor, then patch', () => {
    expect(compareVersions('0.7.0', '0.6.0')).toBe(1)
    expect(compareVersions('0.6.1', '0.6.0')).toBe(1)
    expect(compareVersions('1.0.0', '0.6.0')).toBe(1)
    expect(compareVersions('0.6.0', '1.0.0')).toBe(-1)
  })

  it('compares multi-digit segments numerically (0.6.10 > 0.6.9)', () => {
    expect(compareVersions('0.6.10', '0.6.9')).toBe(1)
    expect(compareVersions('0.6.9', '0.6.10')).toBe(-1)
  })

  it('sorts a prerelease below its same-number release', () => {
    expect(compareVersions('0.6.0-rc.1', '0.6.0')).toBe(-1)
    expect(compareVersions('0.6.0', '0.6.0-rc.2')).toBe(1) // 正式版大
    expect(compareVersions('0.6.0-beta.2', '0.6.0')).toBe(-1)
  })

  it('compares prerelease identifiers numerically when both are numeric', () => {
    expect(compareVersions('0.6.0-rc.1', '0.6.0-rc.2')).toBe(-1)
    expect(compareVersions('0.6.0-rc.10', '0.6.0-rc.9')).toBe(1) // not lexical
  })

  it('compares alpha prerelease identifiers lexically (beta < rc)', () => {
    expect(compareVersions('0.6.0-beta.2', '0.6.0-rc.1')).toBe(-1)
    expect(compareVersions('0.6.0-rc.1', '0.6.0-beta.2')).toBe(1)
  })

  it('ranks numeric prerelease identifiers below alphanumeric ones', () => {
    expect(compareVersions('0.6.0-1', '0.6.0-rc.1')).toBe(-1)
  })

  it('treats a shorter identical prerelease prefix as smaller', () => {
    expect(compareVersions('0.6.0-rc.1', '0.6.0-rc.1.1')).toBe(-1)
  })

  it('lets the core version dominate the prerelease suffix', () => {
    expect(compareVersions('0.6.0-rc.99', '0.6.1-rc.1')).toBe(-1)
  })

  it('ignores +build metadata for precedence', () => {
    expect(compareVersions('0.6.0-rc.1+build.5', '0.6.0-rc.1')).toBe(0)
  })

  it('throws a clear error for invalid inputs', () => {
    for (const bad of ['abc', 'v1.2.3', '1.2.3.4', '1..2', '1.2.x', '0.6.0-', '0.6.0-rc..1', '']) {
      expect(() => compareVersions(bad, '0.6.0')).toThrow(/Invalid semantic version/)
      expect(() => compareVersions('0.6.0', bad)).toThrow(/Invalid semantic version/)
    }
    expect(() => compareVersions('abc', '0.6.0')).toThrow(/abc/)
  })
})

describe('needsUpdate', () => {
  it('returns false when versions are identical', () => {
    expect(needsUpdate('0.6.0', '0.6.0')).toBe(false)
  })

  it('returns true when latest is strictly newer', () => {
    expect(needsUpdate('0.6.0', '0.6.1')).toBe(true)
    expect(needsUpdate('0.6.0', '0.7.0')).toBe(true)
  })

  it('returns true when the installed version is a prerelease of the release', () => {
    expect(needsUpdate('0.6.0-rc.2', '0.6.0')).toBe(true)
  })

  it('returns false when the installed version is newer than latest', () => {
    expect(needsUpdate('0.7.0', '0.6.0')).toBe(false)
  })

  it('throws on invalid inputs', () => {
    expect(() => needsUpdate('not-a-version', '0.6.0')).toThrow()
  })
})

describe('fetchLatestVersion', () => {
  it('returns the npmmirror dist-tags latest (single request)', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('npmmirror') ? okJson({ latest: '0.6.0', next: '0.6.1-beta.1' }) : okJson({ 'dist-tags': { latest: '0.0.0' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLatestVersion()
    expect(result).toEqual({ ok: true, latest: '0.6.0', source: 'npmmirror' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to the npm packument when npmmirror answers with HTTP 404', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('npmmirror') ? httpError(404) : okJson({ 'dist-tags': { latest: '0.7.0' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLatestVersion()
    expect(result).toEqual({ ok: true, latest: '0.7.0', source: 'npm' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to the npm packument when npmmirror returns the wrong shape', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('npmmirror') ? okJson({ next: '9.9.9' }) : okJson({ 'dist-tags': { latest: '0.6.2' } }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLatestVersion()
    expect(result).toEqual({ ok: true, latest: '0.6.2', source: 'npm' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to the npm packument when the npmmirror request rejects', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('npmmirror')) throw new TypeError('network unreachable')
      return okJson({ 'dist-tags': { latest: '0.6.2' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLatestVersion()
    expect(result).toEqual({ ok: true, latest: '0.6.2', source: 'npm' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns ok:false with a combined error when both endpoints fail', async () => {
    const fetchMock = vi.fn(async () => httpError(500))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchLatestVersion()
    expect(result.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    if (!result.ok) {
      expect(result.error).toMatch(/npmmirror/)
      expect(result.error).toMatch(/npm/)
    }
  })

  it('propagates an external signal abort into the request and returns ok:false', async () => {
    let captured: RequestInit | undefined
    const controller = new AbortController()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      captured = init
      return new Promise((_resolve, reject) => {
        const signal = init?.signal
        if (signal?.aborted) reject(new Error('aborted by caller'))
        else signal?.addEventListener('abort', () => reject(new Error('aborted by caller')))
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = fetchLatestVersion(controller.signal)
    controller.abort()

    const result = await promise
    expect(result.ok).toBe(false)
    expect(captured?.signal?.aborted).toBe(true)
    if (!result.ok) expect(result.error).toMatch(/abort/i)
    // The npm fallback aborts immediately once the external signal is done.
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('enforces the internal timeout via a manual timer when AbortSignal.timeout is absent', async () => {
    vi.useFakeTimers()
    try {
      vi.stubGlobal('AbortSignal', {}) // force the setTimeout fallback path
      const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (signal?.aborted) reject(new Error('aborted by internal timeout'))
          else signal?.addEventListener('abort', () => reject(new Error('aborted by internal timeout')))
        }),
      )
      vi.stubGlobal('fetch', fetchMock)

      const resultPromise = fetchLatestVersion()
      await vi.advanceTimersByTimeAsync(8000) // npmmirror attempt times out
      await vi.advanceTimersByTimeAsync(8000) // npm fallback times out
      const result = await resultPromise

      expect(result.ok).toBe(false)
      expect(fetchMock).toHaveBeenCalledTimes(2)
      if (!result.ok) expect(result.error).toMatch(/abort/i)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('SUPPORTED_HOST_LINES', () => {
  it('declares the npm official latest host line (0.1.1-rc.2)', () => {
    expect(SUPPORTED_HOST_LINES).toEqual(['0.1.1-rc.2'])
    expect(SUPPORTED_HOST_LINES).toContain('0.1.1-rc.2')
  })
})

describe('update-check cache (parseUpdateCache)', () => {
  const freshEntry = {
    latest: '0.6.0',
    source: 'npmmirror' as const,
    checkedAt: 1_700_000_000_000,
  }

  it('null (nothing stored) and invalid JSON are cache misses', () => {
    expect(parseUpdateCache(null, freshEntry.checkedAt + 1000)).toBeNull()
    expect(parseUpdateCache('not json', freshEntry.checkedAt + 1000)).toBeNull()
    expect(parseUpdateCache('{"latest": [}', freshEntry.checkedAt + 1000)).toBeNull()
  })

  it('a wrong shape is a cache miss (missing/late fields, non-string latest, bad source)', () => {
    expect(parseUpdateCache('42', freshEntry.checkedAt + 1000)).toBeNull()
    expect(parseUpdateCache('"0.6.0"', freshEntry.checkedAt + 1000)).toBeNull()
    expect(parseUpdateCache(JSON.stringify({ latest: '0.6.0' }), freshEntry.checkedAt + 1000)).toBeNull()
    expect(parseUpdateCache(JSON.stringify({ ...freshEntry, source: 'mirror' }), freshEntry.checkedAt + 1000)).toBeNull()
    expect(parseUpdateCache(JSON.stringify({ ...freshEntry, checkedAt: 'soon' }), freshEntry.checkedAt + 1000)).toBeNull()
  })

  it('returns a fresh, well-formed entry unchanged', () => {
    expect(parseUpdateCache(JSON.stringify(freshEntry), freshEntry.checkedAt + 1000)).toEqual(freshEntry)
  })

  it('rejects an entry older than the 6h TTL', () => {
    const expiredAt = freshEntry.checkedAt + UPDATE_CACHE_TTL_MS
    expect(parseUpdateCache(JSON.stringify(freshEntry), expiredAt - 1)).toEqual(freshEntry)
    expect(parseUpdateCache(JSON.stringify(freshEntry), expiredAt)).toBeNull()
    expect(parseUpdateCache(JSON.stringify(freshEntry), freshEntry.checkedAt + UPDATE_CACHE_TTL_MS + 60_000)).toBeNull()
  })

  it('treats a future checkedAt (clock skew) as fresh', () => {
    expect(parseUpdateCache(JSON.stringify(freshEntry), freshEntry.checkedAt - 3600_000)).toEqual(freshEntry)
  })
})

describe('update-check cache (readUpdateCache / writeUpdateCache / localStorage)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('readUpdateCache returns null when nothing is stored', () => {
    expect(readUpdateCache()).toBeNull()
  })

  it('writeUpdateCache persists the entry; readUpdateCache round-trips it (jsdom localStorage)', () => {
    writeUpdateCache({ latest: '0.7.0', source: 'npm', checkedAt: 1_700_000_000_000 })
    expect(window.localStorage.getItem(UPDATE_CACHE_KEY)).toBe(
      JSON.stringify({ latest: '0.7.0', source: 'npm', checkedAt: 1_700_000_000_000 }),
    )
    expect(readUpdateCache(1_700_000_000_000)).toEqual({ latest: '0.7.0', source: 'npm', checkedAt: 1_700_000_000_000 })
  })

  it('readUpdateCache applies the TTL: an expired stored blob is a cache miss', () => {
    const checkedAt = 1_700_000_000_000
    window.localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ latest: '0.6.0', source: 'npmmirror', checkedAt }))
    expect(readUpdateCache(checkedAt + UPDATE_CACHE_TTL_MS - 1)).not.toBeNull()
    expect(readUpdateCache(checkedAt + UPDATE_CACHE_TTL_MS)).toBeNull()
  })

  it('readUpdateCache ignores a corrupt stored blob instead of throwing', () => {
    window.localStorage.setItem(UPDATE_CACHE_KEY, '{broken')
    expect(readUpdateCache()).toBeNull()
  })
})

describe('loadCachedLatest (cache + network composition)', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('reuses an unexpired cached entry WITHOUT any network request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.setItem(
      UPDATE_CACHE_KEY,
      JSON.stringify({ latest: '0.6.0', source: 'npmmirror', checkedAt: Date.now() }),
    )

    const result = await loadCachedLatest()
    expect(result).toEqual({ ok: true, latest: '0.6.0', source: 'npmmirror' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('queries the registry on a cache miss and persists a successful result', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('npmmirror') ? okJson({ latest: '0.8.1' }) : okJson({ 'dist-tags': { latest: '0.0.0' } }),
    )
    vi.stubGlobal('fetch', fetchMock)
    window.localStorage.setItem(
      UPDATE_CACHE_KEY,
      JSON.stringify({ latest: '0.5.0', source: 'npm', checkedAt: Date.now() - UPDATE_CACHE_TTL_MS }),
    )

    const result = await loadCachedLatest()
    expect(result).toEqual({ ok: true, latest: '0.8.1', source: 'npmmirror' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // The fresh result replaced the stale blob (checkedAt refreshed).
    const stored = JSON.parse(window.localStorage.getItem(UPDATE_CACHE_KEY)!) as { latest: string; source: string }
    expect(stored.latest).toBe('0.8.1')
    expect(stored.source).toBe('npmmirror')
  })

  it('does NOT cache a failed check — the next call retries the network', async () => {
    const fetchMock = vi.fn(async () => httpError(500))
    vi.stubGlobal('fetch', fetchMock)

    const first = await loadCachedLatest()
    expect(first.ok).toBe(false)
    expect(window.localStorage.getItem(UPDATE_CACHE_KEY)).toBeNull()

    const second = await loadCachedLatest()
    expect(second.ok).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(4) // 2 attempts per call, both failing
  })

  it('a cached result on the FIRST call and a manual second call after expiry both behave', async () => {
    // Fresh cache → no request; then expire it and force the fetch.
    const fetchMock = vi.fn(async (url: string) => okJson({ latest: '0.9.0' }))
    vi.stubGlobal('fetch', fetchMock)
    const checkedAt = Date.now()
    window.localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify({ latest: '0.9.0', source: 'npm', checkedAt }))

    expect((await loadCachedLatest()).ok).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()

    // Now the blob is stale relative to a later wall clock.
    window.localStorage.setItem(
      UPDATE_CACHE_KEY,
      JSON.stringify({ latest: '0.9.0', source: 'npm', checkedAt: checkedAt - UPDATE_CACHE_TTL_MS }),
    )
    const result = await loadCachedLatest()
    expect(result).toEqual({ ok: true, latest: '0.9.0', source: 'npmmirror' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})