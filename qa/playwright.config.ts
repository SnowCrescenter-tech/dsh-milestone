/**
 * Playwright config for dsh-milestone surface QA.
 *
 * Targets the locally running harness web shell (start it yourself first —
 * see qa/README.md): `npx @deepseek-ai/dsh web` serves http://127.0.0.1:3080.
 * Surface specs live under qa/ and are excluded from tsconfig + tsdown
 * (explicit entries) and from vitest (include: src/**).
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  // Resolved relative to THIS file's directory (qa/), so surface specs live
  // here and stay outside tsconfig/tsdown (explicit entries) and vitest
  // (include: src/**).
  testDir: '.',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    // Overridable so surface QA can point at an isolated harness instance
    // (e.g. SURFACE_BASE_URL=http://127.0.0.1:3081) without touching the
    // user's own web profile on 3080.
    baseURL: process.env.SURFACE_BASE_URL ?? 'http://127.0.0.1:3080',
  },
})
