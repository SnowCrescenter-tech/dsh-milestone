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
  testDir: 'qa',
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: 'http://127.0.0.1:3080',
  },
})
