/**
 * Build/runtime metadata constants for the dsh-milestone client half.
 *
 * `PLUGIN_VERSION` is normally injected at build time: tsdown's `define`
 * replaces the `__DSH_MILESTONE_VERSION__` identifier with the version read
 * from package.json. Because the identifier is only a free variable when the
 * bundle runs WITHOUT that define (local source, vitest, an integrator's
 * mis-configured tsdown), the read is guarded so an unbuilt run degrades to
 * the explicit `0.0.0-dev` marker instead of throwing.
 *
 * The ambient declaration lives here (not in `src/client/raw-imports.d.ts`)
 * to keep every change in this feature additive — no existing file is
 * modified.
 */

/** Build-time injected version constant (see module doc above). */
declare const __DSH_MILESTONE_VERSION__: string

/**
 * Installed plugin version. Injected at build time as
 * `__DSH_MILESTONE_VERSION__`; falls back to `0.0.0-dev` when unbuilt.
 */
export const PLUGIN_VERSION: string =
  typeof __DSH_MILESTONE_VERSION__ === 'string' ? __DSH_MILESTONE_VERSION__ : '0.0.0-dev'

/** Main repository of dsh-milestone (as referenced by README.md). */
export const PLUGIN_REPO_URL = 'https://github.com/SnowCrescenter-tech/dsh-milestone'

/** npm package page (install channel promoted in the settings menu). */
export const PLUGIN_NPM_URL = 'https://www.npmjs.com/package/dsh-milestone'