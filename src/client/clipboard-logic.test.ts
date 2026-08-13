/**
 * Unit tests for the clipboard-logic `copyText` helper: it resolves true on a
 * successful Clipboard API write, resolves false when the API is unavailable
 * (no navigator, or no clipboard.writeText) and resolves false when the write
 * rejects. The navigator is stubbed per case so the real browser API is never
 * touched.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard-logic'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('copyText', () => {
  it('resolves true and calls writeText with the exact text on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyText('hello world')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('hello world')
  })

  it('resolves false when the clipboard API is missing', async () => {
    vi.stubGlobal('navigator', {})

    await expect(copyText('hello')).resolves.toBe(false)
  })

  it('resolves false when writeText is not defined on the clipboard', async () => {
    vi.stubGlobal('navigator', { clipboard: {} })

    await expect(copyText('hello')).resolves.toBe(false)
  })

  it('resolves false when navigator is undefined', async () => {
    vi.stubGlobal('navigator', undefined)

    await expect(copyText('hello')).resolves.toBe(false)
  })

  it('resolves false and does not write when writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { clipboard: { writeText } })

    await expect(copyText('hello')).resolves.toBe(false)
    expect(writeText).toHaveBeenCalledTimes(1)
  })
})
