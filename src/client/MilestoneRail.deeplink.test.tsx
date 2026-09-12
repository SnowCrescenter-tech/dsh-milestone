/**
 * Component tests for P3 deep links (`#msg=<anchor-key>` URL hash):
 *   - mounting with a deep-link hash scrolls the target row into view AFTER
 *     the deferred start (so it lands after the harness's own jump-to-bottom
 *     on load)
 *   - user jumps (dot click) write the mark key back into the hash via
 *     `history.replaceState` so refresh/share preserves the position
 *   - manual URL edits (`hashchange`) jump when the target is a known mark
 *   - a known mark whose DOM row is not rendered (older than the loaded
 *     window) triggers one bounded `loadOlder` retry phase, then gives up
 *     silently
 *   - malformed / unrelated hashes never scroll and never call loadOlder
 *
 * The scroll assertions reuse the keyboard test's spy pattern
 * (`vi.spyOn(Element.prototype, 'scrollIntoView')` + `mock.instances.at(-1)`
 * dataset check); the deep-link retry schedule is driven with fake timers so
 * the polls are deterministic.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { renderRail } from '../test/renderRail.tsx'
import type { RailUser } from '../test/renderRail.tsx'
import { buildSnapshot } from '../test/snapshot-fixture.ts'
import type { ConversationSnapshotFixture } from '../test/snapshot-fixture.ts'
import { buildMessageHash } from './deep-link-logic'
import { MilestoneRail } from './MilestoneRail.tsx'
import type { MilestoneRailProps } from './MilestoneRail.tsx'
import { zh } from './locales.ts'

const USERS: RailUser[] = [
  { key: '13:user<dl-1>', seq: 1, time: 1_700_000_000_000, text: '第一条：如何优化构建' },
  { key: '13:user<dl-2>', seq: 2, time: 1_700_000_060_000, text: '第二条：如何减少内存' },
  { key: '13:user<dl-3>', seq: 3, time: 1_700_000_120_000, text: '第三条：如何加速启动' },
]

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.useRealTimers()
  // The URL hash is shared state across tests in this file (jump writes it) —
  // reset so no test inherits a stale deep link.
  window.location.hash = ''
})

/** Locale interpreter over the zh dictionary (mirrors renderRail's makeT). */
function makeT(dict: Record<string, string>) {
  return (key: string, params?: Record<string, string | number>) => {
    const tpl = dict[key] ?? key
    return params ? tpl.replace(/\{(\w+)\}/g, (slot, name) => (name in params ? String(params[name]) : slot)) : tpl
  }
}

/** The nth dot, by its accessible name (same convention as the keyboard tests). */
function dot(n: number): HTMLElement {
  return screen.getByRole('button', { name: `跳转到第 ${n} 条消息` })
}

/**
 * Mirror of renderRail's scaffold that renders DOM anchor rows ONLY for the
 * given keys — lets a deep-linked mark be a KNOWN mark (in the snapshot)
 * whose row is not in the DOM (older than the loaded window).
 */
function renderRailRowless(users: RailUser[], renderedKeys: readonly string[]) {
  const snapshot = buildSnapshot({ users })
  const useSession = (selector: (snap: ConversationSnapshotFixture) => unknown) => selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const props = {
    useSession,
    sessionId: 'fixture',
    useProjection: () => undefined,
    loadOlder,
    t: makeT(zh as Record<string, string>),
  } as unknown as MilestoneRailProps

  const result = render(
    <div data-conversation-scroll>
      <div style={{ height: 400 }}>
        {users
          .filter((user) => renderedKeys.includes(user.key))
          .map((user) => (
            <div key={user.key} data-chat-anchor-key={user.key} style={{ height: 48 }}>
              {user.text}
            </div>
          ))}
      </div>
      <MilestoneRail {...props} />
    </div>,
  )
  return { ...result, snapshot, loadOlder }
}

describe('MilestoneRail deep links (P3)', () => {
  it('mounting with a #msg= hash scrolls the target row into view after the deferred start', () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    window.location.hash = buildMessageHash(String(USERS[1].seq))
    const rail = renderRail(USERS)

    // The jump is deferred (it must land AFTER the harness's own
    // jump-to-bottom on load), so nothing scrolls synchronously.
    expect(spy).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(100) // initial delay — the first attempt finds the row
    })

    expect(spy).toHaveBeenCalled()
    const jumped = spy.mock.instances.at(-1) as HTMLElement | undefined
    expect(jumped?.dataset.chatAnchorKey).toBe(String(USERS[1].seq))
    // In-window marks never trigger the load-older fallback.
    expect(rail.loadOlder).not.toHaveBeenCalled()
  })

  it('jumps to a row whose anchor is the real harness node key (message-id suffix)', () => {
    const replaceSpy = vi.spyOn(history, 'replaceState')
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
    // The rows carry `13:input-message<messageId>`, NOT the seq — the real
    // 0.1.5 conversation-row vocabulary. Jump must still find the row.
    renderRail(USERS, { harnessAnchors: true })

    fireEvent.click(dot(2))

    expect(replaceSpy).toHaveBeenCalled()
    const jumped = scrollSpy.mock.instances.at(-1) as HTMLElement | undefined
    expect(jumped?.dataset.chatAnchorKey).toBe('13:input-messagemsg-2')
  })

  it('pages older history in when the clicked dot is outside the loaded window', async () => {
    vi.useFakeTimers()
    // The dots cover the whole log, but only the FIRST message's row is rendered
    // (the DOM holds the loaded window; older rows page in on demand).
    const { loadOlder } = renderRail(USERS, { hasMore: true, renderedSeqs: [USERS[0].seq] })

    fireEvent.click(dot(3))

    // The locate loop fetches one older page immediately, then polls the DOM.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(loadOlder).toHaveBeenCalledTimes(1)
    // The dot pulses while the target is being paged in — never a dead click.
    expect(document.querySelector('[data-locating="true"]')).not.toBeNull()

    // Bounded: it gives up after the page budget and clears the pulse.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30 * 150 + 500)
    })
    expect(loadOlder.mock.calls.length).toBeGreaterThan(1)
    expect(loadOlder.mock.calls.length).toBeLessThanOrEqual(20)
    expect(document.querySelector('[data-locating]')).toBeNull()
  })

  it('does not page when there is no older history to fetch', async () => {
    const { loadOlder } = renderRail(USERS, { hasMore: false, renderedSeqs: [USERS[0].seq] })
    fireEvent.click(dot(3))
    await act(async () => {
      await Promise.resolve()
    })
    expect(loadOlder).not.toHaveBeenCalled()
    expect(document.querySelector('[data-locating]')).toBeNull()
  })

  it('clicking a rail dot scrolls and writes #msg=<key> via history.replaceState', () => {
    const replaceSpy = vi.spyOn(history, 'replaceState')
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
    renderRail(USERS)

    fireEvent.click(dot(2))

    expect(replaceSpy).toHaveBeenCalled()
    expect(replaceSpy.mock.calls.at(-1)?.[2]).toBe(buildMessageHash(String(USERS[1].seq)))
    const jumped = scrollSpy.mock.instances.at(-1) as HTMLElement | undefined
    expect(jumped?.dataset.chatAnchorKey).toBe(String(USERS[1].seq))
  })

  it('jumps when the hash changes to a known mark (manual URL edit)', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    renderRail(USERS)

    window.location.hash = buildMessageHash(String(USERS[2].seq))
    window.dispatchEvent(new HashChangeEvent('hashchange'))

    const jumped = spy.mock.instances.at(-1) as HTMLElement | undefined
    expect(jumped?.dataset.chatAnchorKey).toBe(String(USERS[2].seq))
  })

  it('polls for a known mark whose row is not rendered, calls loadOlder once, then gives up silently', async () => {
    vi.useFakeTimers()
    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView')
    window.location.hash = buildMessageHash(String(USERS[1].seq))
    const { loadOlder } = renderRailRowless(USERS, [String(USERS[0].seq)])

    // Phase A: initial delay + 5 polls — the row never appears.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100 + 5 * 150)
    })
    expect(loadOlder).toHaveBeenCalledTimes(1)

    // Phase B: bounded retries after loadOlder — still absent, give up.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 150 + 500)
    })
    expect(loadOlder).toHaveBeenCalledTimes(1)
    expect(scrollSpy).not.toHaveBeenCalled()
  })

  it('mounting with an unrelated hash never scrolls and never calls loadOlder', () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    window.location.hash = '#other=value'
    const rail = renderRail(USERS)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(spy).not.toHaveBeenCalled()
    expect(rail.loadOlder).not.toHaveBeenCalled()
  })

  it('mounting with an empty #msg= value never scrolls', () => {
    vi.useFakeTimers()
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView')
    window.location.hash = '#msg='
    renderRail(USERS)

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(spy).not.toHaveBeenCalled()
  })
})
