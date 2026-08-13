/**
 * Test shim for `@deepseek-ai/dsh-client-runtime/client`.
 *
 * The harness ships its client half as a **browser closure bundle**
 * (`window.__ModuleLoader__.load({ factory })` — the harness loader's dialect),
 * which vitest cannot import directly (no loader, and its CJS interop yields an
 * empty namespace). This shim evaluates the REAL bundled source once, captures
 * its true `module.exports`, and re-exports them — only the loader shell is
 * simulated, exactly what production's `window.__ModuleLoader__` provides.
 *
 * Wired in via `vitest.config.ts` `resolve.alias` so EVERY test file that
 * imports the runtime client (bookmarkStore.ts, and later index.ts) gets the
 * real engine without repeating this loader-shell dance per file.
 */
import bundleSrc from '@deepseek-ai/dsh-client-runtime/client?raw'
import * as cordisNS from '@deepseek-ai/cordis'
import * as uiSlotsNS from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: gives `defineStore` its real signature (type resolution goes
// through tsconfig, not the vitest alias, so this is unaffected by the shim).
import type { defineStore as DefineStoreFn } from '@deepseek-ai/dsh-client-runtime/client'

/** The closure bundle's synchronous require table (genuine installed modules). */
const requireShim = (id: string): unknown => {
  if (id === '@deepseek-ai/cordis') return cordisNS
  if (id === '@deepseek-ai/dsh-client-ui-slots') return uiSlotsNS
  throw new Error(`runtime-client shim: unexpected require("${id}")`)
}

// `new Function` runs in the true global realm, so the loader shim is installed
// on THAT realm's `window` inside the eval body; `load()` returns the factory's
// module.exports. The bundle's single top-level `load({...})` call is prefixed
// with `return` so this hands the real exports back.
const realExports = new Function(
  'require',
  `window.__ModuleLoader__ = { load: (entry) => entry.factory(require) };\nreturn ` + bundleSrc,
)(requireShim) as Record<string, unknown>

/** The genuine `defineStore` engine (immer drafts + localStorage persistence). */
export const defineStore = realExports.defineStore as typeof DefineStoreFn
