/**
 * Component tests for the hover-tooltip action buttons (C3): "copy message"
 * and "fork from here".
 *
 * Contract asserted:
 *   - hovering a dot whose message text exceeds the 80-char preview window
 *     and clicking `[data-copy-message]` calls `navigator.clipboard.writeText`
 *     with the FULL message text (not the truncated preview) and marks the
 *     button `data-copied="true"`
 *   - clicking `[data-fork-here]` calls the injected `forkAt` action with the
 *     hovered mark's `seq` and marks the button `data-forked="true"`
 *   - hovering a DIFFERENT mark clears the transient copy acknowledgement
 *     (the hover change is the reset — no timers)
 *
 * renderRail (src/test/renderRail.tsx) feeds user messages into the snapshot
 * and returns the `forkAt` mock, so these tests drive the real rail DOM
 * through the real copyText / forkAt seams. `navigator.clipboard.writeText`
 * is stubbed per test (vi.stubGlobal) and restored by afterEach.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderRail } from '../test/renderRail.tsx'

/** A message body LONGER than the 80-char hover preview window — the copy
 *  assertion must distinguish FULL text from the truncated preview. */
const LONG_TEXT =
  '请帮我优化这段代码的性能，它目前在大数据量下运行得很慢，我需要它能够在内存占用和响应时间上都有明显改善，' +
  '最好还能给出具体的修改建议和衡量标准，这样我才能确认优化是否真的有效。'

const USERS = [
  { key: '13:user<act-1>', seq: 1, time: 1_700_000_000_000, text: LONG_TEXT },
  { key: '13:user<act-2>', seq: 2, time: 1_700_000_060_000, text: '第二条消息' },
]

/** Stub the Clipboard API and return the writeText mock (per-test, restored by afterEach). */
function stubClipboard(): ReturnType<typeof vi.fn> {
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  return writeText
}

/** The tooltip action button; throws when absent (clear failure reason). */
function actionButton(selector: string): HTMLButtonElement {
  const el = document.querySelector<HTMLButtonElement>(selector)
  if (el === null) throw new Error(`${selector} button not found in tooltip`)
  return el
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MilestoneRail tooltip actions', () => {
  it('copies the FULL message text when the copy action is clicked', async () => {
    const writeText = stubClipboard()
    renderRail(USERS)

    fireEvent.mouseEnter(screen.getByRole('button', { name: '跳转到第 1 条消息' }))
    const copyButton = actionButton('[data-copy-message]')
    fireEvent.click(copyButton)

    await waitFor(() => expect(copyButton).toHaveAttribute('data-copied', 'true'))
    expect(writeText).toHaveBeenCalledWith(LONG_TEXT)
  })

  it('forks from the hovered message when the fork action is clicked', async () => {
    const rail = renderRail(USERS)

    fireEvent.mouseEnter(screen.getByRole('button', { name: '跳转到第 1 条消息' }))
    const forkButton = actionButton('[data-fork-here]')
    fireEvent.click(forkButton)

    await waitFor(() => expect(forkButton).toHaveAttribute('data-forked', 'true'))
    expect(rail.forkAt).toHaveBeenCalledWith(USERS[0].seq)
  })

  it('clears the copy acknowledgement when hovering a different mark', async () => {
    stubClipboard()
    renderRail(USERS)

    fireEvent.mouseEnter(screen.getByRole('button', { name: '跳转到第 1 条消息' }))
    const copyButton = actionButton('[data-copy-message]')
    fireEvent.click(copyButton)
    await waitFor(() => expect(copyButton).toHaveAttribute('data-copied', 'true'))

    fireEvent.mouseEnter(screen.getByRole('button', { name: '跳转到第 2 条消息' }))
    expect(actionButton('[data-copy-message]')).not.toHaveAttribute('data-copied')
  })
})
