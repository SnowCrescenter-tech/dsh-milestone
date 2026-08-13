/**
 * Surface QA placeholder for dsh-milestone.
 *
 * Requires the harness web shell to be running (see qa/README.md). Later
 * feature tasks replace this with real assertions against the milestone rail
 * (dots rendered per user message, hover tooltip, click-to-jump).
 */
import { test } from '@playwright/test'

test('loads the harness web shell', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')
  const title = await page.title()
  console.log(`[surface] page title: ${title}`)
})
