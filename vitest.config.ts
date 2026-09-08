/**
 * Vitest config for dsh-milestone.
 *
 * Deliberately sits at the repo root OUTSIDE tsconfig.json's `include: ["src"]`,
 * so `tsc --noEmit` never type-checks it (vitest owns this file's runtime).
 * Tests run in jsdom because the client half renders React components that
 * touch document/window (ResizeObserver, scrollIntoView, etc.).
 *
 * 0.1.2 compat: the snapshot-store engine moved to `@deepseek-ai/dsh-client-store`
 * (a plain ESM package, importable directly), so the old closure-bundle shim
 * (`src/test/runtime-client.ts`) is gone and no alias is needed.
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    /**
     * Pin a non-opaque jsdom origin: jsdom only exposes window.localStorage
     * for http(s) documents, and some vitest/jsdom versions default to
     * about:blank, where accessing it throws "localStorage is not available
     * for opaque origins". That broke the toolbar-prefs / version-logic
     * suites on clean clones (Linux, Node 22). setup.ts also polyfills
     * localStorage defensively, so the suites stay green even if the
     * default URL ever changes again.
     */
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})