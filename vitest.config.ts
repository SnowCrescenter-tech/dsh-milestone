/**
 * Vitest config for dsh-milestone.
 *
 * Deliberately sits at the repo root OUTSIDE tsconfig.json's `include: ["src"]`,
 * so `tsc --noEmit` never type-checks it (vitest owns this file's runtime).
 * Tests run in jsdom because the client half renders React components that
 * touch document/window (ResizeObserver, scrollIntoView, etc.).
 */
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
