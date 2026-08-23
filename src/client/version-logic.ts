/**
 * Pure update-check logic for dsh-milestone, deliberately free of React, the
 * harness runtime, and any node-only API so it runs identically in the browser
 * bundle, vitest (jsdom), and future shells.
 *
 * Design intent:
 * - `compareVersions` / `needsUpdate` are pure, side-effect-free functions that
 *   follow npm semver precedence for the shapes this plugin actually publishes
 *   (`x.y.z` plus optional `-rc.N` / `-beta.N` prereleases). Anything else is
 *   an explicit error rather than a silent mis-comparison.
 * - `fetchLatestVersion` is the only I/O: it reads the `latest` dist-tag from
 *   npmmirror's cheap dist-tags endpoint first (it CORS-echoes this page's
 *   Origin), then falls back to the full npm packument (ACAO: *). Every
 *   request carries an internal 8s timeout combined with the caller's signal —
 *   whichever aborts first wins — and every failure degrades to a structured
 *   `{ ok: false }` result, never a throw.
 * - `SUPPORTED_HOST_LINES` is a SELF-DECLARED compatibility list, not a probe:
 *   the harness reports no trustworthy host version in the browser
 *   (`host.describe().version` is a stub), so the plugin declares which npm
 *   `latest` host-version lines it supports and the UI renders that as-is.
 */

/** Host-version lines this plugin declares support for (npm official latest
 * line; bump it as the peer/dependency ranges move). */
export const SUPPORTED_HOST_LINES: readonly string[] = ['0.1.1-rc.2']

/** Internal per-request timeout for the network attempts. */
const REQUEST_TIMEOUT_MS = 8000

/** npmmirror dist-tags endpoint: lean JSON (`{"latest":"0.6.0", ...}`),
 * echoes this page's Origin in `Access-Control-Allow-Origin`. */
const NPMIRROR_DIST_TAGS_URL = 'https://registry.npmmirror.com/-/package/dsh-milestone/dist-tags'

/** npm full packument; `dist-tags.latest` sits at the JSON root, and the
 * endpoint sends `Access-Control-Allow-Origin: *`. */
const NPM_PACKUMENT_URL = 'https://registry.npmjs.org/dsh-milestone'

/** Numeric identifier test shared by core and prerelease segments. */
const NUMERIC_RE = /^\d+$/

/** A parsed version: padded 3-segment core plus prerelease identifiers. */
interface ParsedVersion {
  readonly core: readonly number[]
  readonly pre: readonly string[]
}

/**
 * Parse a version string into comparable parts.
 * Accepts `major[.minor[.patch]][-prerelease][+build]`; missing core segments
 * pad with 0 and `+build` metadata is ignored (per semver precedence).
 * @throws {Error} with the offending input when the shape is not parseable.
 */
function parseVersion(input: string): ParsedVersion {
  if (typeof input !== 'string' || input.trim() === '') {
    throw new Error(`Invalid semantic version: ${JSON.stringify(input)} (expected "x.y.z" with optional "-pre" suffix)`)
  }
  const s = input.trim()
  // Build metadata (`+...`) never participates in precedence; drop it.
  const plus = s.indexOf('+')
  const withoutBuild = plus === -1 ? s : s.slice(0, plus)
  const dash = withoutBuild.indexOf('-')
  const corePart = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash)
  const prePart = dash === -1 ? undefined : withoutBuild.slice(dash + 1)

  const segments = corePart.split('.')
  if (segments.length < 1 || segments.length > 3 || !segments.every((seg) => NUMERIC_RE.test(seg))) {
    throw new Error(`Invalid semantic version: ${JSON.stringify(input)} (expected "x.y.z" with optional "-pre" suffix)`)
  }
  const core = segments.map(Number)

  let pre: string[] = []
  if (prePart !== undefined) {
    if (prePart === '' || !prePart.split('.').every((id) => /^[0-9A-Za-z-]+$/.test(id))) {
      throw new Error(`Invalid semantic version: ${JSON.stringify(input)} (bad prerelease suffix)`)
    }
    pre = prePart.split('.')
  }
  return { core, pre }
}

/**
 * Compare two version strings per npm semver precedence.
 * @param a - first version (`x.y.z` with optional `-pre` suffix; build
 * metadata ignored; missing core segments pad with 0).
 * @param b - second version, same grammar.
 * @returns -1 when `a < b`, 0 when equal, 1 when `a > b`. Prereleases sort
 * below their same-number release; prerelease identifiers compare numerically
 * when both are numeric, lexically when both are alphanumeric, and numeric
 * identifiers always sort before alphanumeric ones.
 * @throws {Error} for inputs that do not match the grammar.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a)
  const pb = parseVersion(b)

  // Core segments, missing ones padded with 0.
  for (let i = 0; i < 3; i++) {
    const x = pa.core[i] ?? 0
    const y = pb.core[i] ?? 0
    if (x < y) return -1
    if (x > y) return 1
  }

  // Equal core: a release beats its own prerelease; otherwise compare
  // identifier-by-identifier (a shorter identical prefix sorts first).
  if (pa.pre.length === 0 && pb.pre.length === 0) return 0
  if (pa.pre.length === 0) return 1
  if (pb.pre.length === 0) return -1
  const len = Math.max(pa.pre.length, pb.pre.length)
  for (let i = 0; i < len; i++) {
    const x = pa.pre[i]
    const y = pb.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xNum = NUMERIC_RE.test(x)
    const yNum = NUMERIC_RE.test(y)
    if (xNum && yNum) {
      if (x !== y) return Number(x) < Number(y) ? -1 : 1
    } else if (xNum) {
      return -1 // numeric identifiers sort before alphanumeric ones
    } else if (yNum) {
      return 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/**
 * Whether the installed plugin should offer an update.
 * @param current - installed version.
 * @param latest - newest published version.
 * @returns true only when `latest` is strictly greater than `current`
 * (identical versions, or a newer installed version, return false).
 * @throws {Error} when either input is not a parseable version.
 */
export function needsUpdate(current: string, latest: string): boolean {
  return compareVersions(current, latest) < 0
}

/** Successful result of {@link fetchLatestVersion}. */
export type LatestVersionOk = { ok: true; latest: string; source: 'npmmirror' | 'npm' }
/** Failure result of {@link fetchLatestVersion}. */
export type LatestVersionFail = { ok: false; error: string }

/**
 * Build a request signal: a fresh AbortController aborted by EITHER the
 * caller's external signal (which wins when it fires first) OR an internal
 * timeout. Uses `AbortSignal.timeout` when the environment provides it and
 * falls back to a manual `setTimeout` + abort otherwise (jsdom older
 * versions expose no `AbortSignal.timeout`).
 * @param external - caller signal; when already aborted the request fires
 * immediately with an aborted signal.
 * @param timeoutMs - internal timeout in ms.
 * @returns the combined signal plus a cleanup that detaches all listeners
 * (must be called so no listener outlives the request).
 */
function createRequestSignal(external: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const detach: Array<() => void> = []

  if (external) {
    if (external.aborted) {
      controller.abort()
    } else {
      external.addEventListener('abort', abort, { once: true })
      detach.push(() => external.removeEventListener('abort', abort))
    }
  }

  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    const t = AbortSignal.timeout(timeoutMs)
    t.addEventListener('abort', abort, { once: true })
    detach.push(() => t.removeEventListener('abort', abort))
  } else {
    const timer = setTimeout(abort, timeoutMs)
    detach.push(() => clearTimeout(timer))
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const fn of detach) fn()
      detach.length = 0
    },
  }
}

/** Extract `latest` from the npmmirror dist-tags JSON root. */
function extractFromDistTags(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null
  const latest = (data as { latest?: unknown }).latest
  return typeof latest === 'string' && latest.length > 0 ? latest : null
}

/** Extract `latest` from the npm packument's root `dist-tags` object. */
function extractFromPackument(data: unknown): string | null {
  if (data === null || typeof data !== 'object') return null
  const distTags = (data as { 'dist-tags'?: unknown })['dist-tags']
  if (distTags === null || typeof distTags !== 'object') return null
  const latest = (distTags as { latest?: unknown }).latest
  return typeof latest === 'string' && latest.length > 0 ? latest : null
}

/** Human-readable failure detail for one endpoint attempt. */
function describeError(source: string, cause: unknown): string {
  const name = cause instanceof Error ? cause.name : ''
  const message = cause instanceof Error ? cause.message : String(cause)
  if (name === 'AbortError') return `${source}: aborted (${message})`
  return `${source}: ${message}`
}

/**
 * One attempt at fetching the `latest` dist-tag from an endpoint.
 * @returns ok with the tag, or ok:false with a per-source error description.
 */
async function tryFetchLatest(
  url: string,
  extract: (data: unknown) => string | null,
  source: 'npmmirror' | 'npm',
  external: AbortSignal | undefined,
): Promise<LatestVersionOk | LatestVersionFail> {
  try {
    const { signal, cleanup } = createRequestSignal(external, REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: unknown = await res.json()
      const latest = extract(data)
      if (latest === null) throw new Error('unexpected response shape (no "latest" dist-tag)')
      return { ok: true, latest, source }
    } finally {
      cleanup()
    }
  } catch (cause) {
    return { ok: false, error: describeError(source, cause) }
  }
}

/**
 * Query npm for the newest published version of `dsh-milestone`.
 *
 * Strategy: npmmirror's dist-tags endpoint first (lightweight and CORS-open
 * to this Origin); if that fails or its shape is wrong, the full npm
 * packument fallback (`dist-tags.latest` at the JSON root). Each request
 * aborts after 8s via `AbortSignal.timeout` (manual timer fallback when the
 * environment lacks it) OR immediately when the passed-in signal aborts.
 * @param signal - optional caller abort signal; aborts the in-flight attempt
 * with priority over the internal timeout.
 * @returns the latest version and which registry answered, or a structured
 * error when both endpoints fail. Never throws.
 */
export async function fetchLatestVersion(
  signal?: AbortSignal,
): Promise<LatestVersionOk | LatestVersionFail> {
  const viaMirror = await tryFetchLatest(NPMIRROR_DIST_TAGS_URL, extractFromDistTags, 'npmmirror', signal)
  if (viaMirror.ok) return viaMirror
  const viaNpm = await tryFetchLatest(NPM_PACKUMENT_URL, extractFromPackument, 'npm', signal)
  if (viaNpm.ok) return viaNpm
  return { ok: false, error: `${viaMirror.error}; ${viaNpm.error}` }
}

// ---------------------------------------------------------------------------
// Update-check cache: the "check at most once per freshness window" layer on
// top of fetchLatestVersion. A successful check is persisted under one
// localStorage key as `{ latest, source, checkedAt }` (checkedAt = epoch ms);
// `loadCachedLatest` reuses an unexpired entry without any network traffic and
// only calls the registry chain when the cache is absent or stale. Same
// never-throw discipline as fetchLatestVersion: every storage read/write is
// guarded and degrades to the cache miss / silent-failure paths.
// ---------------------------------------------------------------------------

/** localStorage key holding the last successful update check. */
export const UPDATE_CACHE_KEY = 'dsh-milestone.update-cache'

/** Freshness window for a cached check result: 6 hours. */
export const UPDATE_CACHE_TTL_MS = 6 * 60 * 60 * 1000

/** A persisted successful check: the version found, which registry answered,
 * and when it was recorded (epoch ms, wall clock). */
export interface UpdateCacheEntry {
  readonly latest: string
  readonly source: 'npmmirror' | 'npm'
  readonly checkedAt: number
}

/**
 * Pure parse + freshness check of a stored blob: `null` for `null`/invalid
 * JSON, a wrong shape, or an entry older than {@link UPDATE_CACHE_TTL_MS}.
 * A `checkedAt` in the future (clock skew) is treated as fresh — it decays
 * naturally once wall time catches up. Never throws.
 * @param raw - the raw `localStorage` value (or null when absent).
 * @param now - wall-clock epoch ms to judge freshness against (injectable for
 * tests; defaults to `Date.now()`).
 */
export function parseUpdateCache(raw: string | null, now: number = Date.now()): UpdateCacheEntry | null {
  if (raw === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const { latest, source, checkedAt } = parsed as { latest?: unknown; source?: unknown; checkedAt?: unknown }
  if (typeof latest !== 'string' || latest === '') return null
  if (source !== 'npmmirror' && source !== 'npm') return null
  if (typeof checkedAt !== 'number' || !Number.isFinite(checkedAt)) return null
  if (now - checkedAt >= UPDATE_CACHE_TTL_MS) return null
  return { latest, source, checkedAt }
}

/**
 * Read + parse the persisted cache entry from localStorage. Any storage
 * failure degrades to `null` (cache miss) — the update check is best-effort.
 * @param now - wall-clock epoch ms for freshness (see {@link parseUpdateCache}).
 */
export function readUpdateCache(now: number = Date.now()): UpdateCacheEntry | null {
  try {
    return parseUpdateCache(localStorage.getItem(UPDATE_CACHE_KEY), now)
  } catch {
    return null
  }
}

/**
 * Persist a successful check result (the caller supplies `checkedAt`, usually
 * `Date.now()`). Silently ignores storage failures — the cache is an
 * optimization, never a hard dependency.
 */
export function writeUpdateCache(entry: UpdateCacheEntry): void {
  try {
    localStorage.setItem(UPDATE_CACHE_KEY, JSON.stringify(entry))
  } catch {
    // Storage unavailable — the next check simply goes to the network.
  }
}

/**
 * The cache-aware entry point for the UI: reuse an unexpired cached result
 * when one exists, otherwise query npm (npmmirror → packument fallback) and
 * persist a successful result for the next {@link UPDATE_CACHE_TTL_MS}.
 * Never throws; failures return the same structured `{ ok: false }` result as
 * {@link fetchLatestVersion}.
 * @param signal - optional caller abort signal, forwarded to the network
 * attempt only (a cache hit needs no signal).
 */
export async function loadCachedLatest(signal?: AbortSignal): Promise<LatestVersionOk | LatestVersionFail> {
  const cached = readUpdateCache()
  if (cached !== null) {
    return { ok: true, latest: cached.latest, source: cached.source }
  }
  const fresh = await fetchLatestVersion(signal)
  if (fresh.ok) {
    writeUpdateCache({ latest: fresh.latest, source: fresh.source, checkedAt: Date.now() })
  }
  return fresh
}