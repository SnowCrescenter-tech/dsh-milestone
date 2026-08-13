/**
 * Vitest config for dsh-milestone.
 *
 * Deliberately sits at the repo root OUTSIDE tsconfig.json's `include: ["src"]`,
 * so `tsc --noEmit` never type-checks it (vitest owns this file's runtime).
 * Tests run in jsdom because the client half renders React components that
 * touch document/window (ResizeObserver, scrollIntoView, etc.).
 *
 * `resolve.alias` maps the runtime's client subpath to a test shim
 * (`src/test/runtime-client.ts`): the shipped client is a browser closure
 * bundle (`window.__ModuleLoader__.load(...)`) vitest cannot import, so the
 * shim evaluates the real bundle and re-exports its genuine engine.
 */
import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

const runtimeClientShim = fileURLToPath(new URL('./src/test/runtime-client.ts', import.meta.url))

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-runtime/client': runtimeClientShim,
    },
  },
})
