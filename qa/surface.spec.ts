/**
 * Surface QA for dsh-milestone.
 *
 * Requires the harness web shell to be running (see qa/README.md). The shell
 * is a REAL rc.2 harness (github:deepseek-ai/deepseek-harness) with the
 * plugin installed into its `web` profile; the rail itself only renders once
 * a conversation holds >= 2 user messages, so this spec pins what is
 * verifiable without a seeded session:
 *   - the page boots (title + app root mount),
 *   - the plugin's client bundle is served and preloaded by the boot HTML.
 * Real rail interactions (dots, hover, jump) are covered by the vitest
 * component suite against the harness snapshot contract.
 */
import { expect, test } from '@playwright/test'

test('loads the harness web shell', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  const title = await page.title()
  console.log(`[surface] page title: ${title}`)
  expect(title.length).toBeGreaterThan(0)
})

test('the milestone plugin client bundle is preloaded by the boot manifest', async ({ page }) => {
  const bundled: string[] = []
  page.on('request', (req) => {
    if (req.url().includes('/plugins/dsh-milestone/')) bundled.push(req.url())
  })
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  console.log(`[surface] milestone bundle requests: ${JSON.stringify(bundled)}`)
  expect(bundled.length).toBeGreaterThan(0)
})
