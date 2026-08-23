/**
 * Unit tests for the shared useOutsideDismiss hook (the rail panels'
 * "click outside to dismiss" contract):
 *
 *   - the window listener arms only while `open` and calls `onClose` once
 *     per outside pointerdown;
 *   - a pointerdown INSIDE the panel never dismisses;
 *   - the opening gesture (the toggle click that flips `open`) never
 *     immediately dismisses;
 *   - `options.exclude` hands excluded targets (the panel's own toggle) back
 *     to the caller's own handler;
 *   - closing and unmounting clean the window listener up;
 *   - an absent `onClose` keeps the hook inert.
 *
 * The timestamp shield (pre-arming `event.timeStamp` events are dropped)
 * is defense-in-depth for the opening gesture — see the hook's file header
 * for why the arm-in-effect ordering already prevents it, so it is not
 * asserted directly.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { outsideDismissMatches, useOutsideDismiss } from './useOutsideDismiss.ts'
import type { OutsideDismissOptions } from './useOutsideDismiss.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/**
 * Test harness: a toggle that flips `open` + a panel when open. The toggle is
 * deliberately NOT excluded by default — it mirrors how a caller arms the
 * hook, and the opening-gesture cases prove the hook never misfires on it.
 */
function Harness({
  onClose,
  exclude,
}: {
  onClose?: () => void
  exclude?: OutsideDismissOptions['exclude']
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  useOutsideDismiss(panelRef, open, onClose, { exclude })
  return (
    <div>
      <button type="button" data-toggle onClick={() => setOpen((v) => !v)}>
        toggle
      </button>
      <button type="button" data-excluded>
        excluded
      </button>
      {open && (
        <div ref={panelRef} data-panel>
          <button type="button" data-inside>
            inside
          </button>
        </div>
      )}
    </div>
  )
}

function toggle(): HTMLElement {
  return screen.getByRole('button', { name: 'toggle' })
}

function panel(): HTMLElement | null {
  return document.querySelector('[data-panel]')
}

function inside(): HTMLElement {
  const el = document.querySelector('[data-inside]')
  if (el === null) throw new Error('data-inside not found')
  return el as HTMLElement
}

function excluded(): HTMLElement {
  return screen.getByRole('button', { name: 'excluded' })
}

describe('useOutsideDismiss', () => {
  it('calls onClose once for a pointerdown outside the open panel', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    fireEvent.click(toggle())
    expect(panel()).not.toBeNull()
    // Opening itself never dismisses — the toggle click that flipped `open`
    // arms the listener afterwards and must not be replayed as outside.
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ignores a pointerdown inside the panel', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    fireEvent.click(toggle())
    fireEvent.pointerDown(inside())

    expect(onClose).not.toHaveBeenCalled()
  })

  it('is inert while the panel is closed', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    fireEvent.pointerDown(document.body)

    expect(onClose).not.toHaveBeenCalled()
  })

  it('honours an exclude predicate: excluded targets are left to the caller', () => {
    const onClose = vi.fn()
    render(
      <Harness
        onClose={onClose}
        exclude={(target) => outsideDismissMatches(target, '[data-excluded]')}
      />,
    )

    fireEvent.click(toggle())
    fireEvent.pointerDown(excluded())
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('removes the listener when the panel closes, so later outside pointerdowns do nothing', () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    fireEvent.click(toggle())
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)

    // The harness's toggle mirrors a real panel toggle: clicking it again
    // closes the panel (unmount runs the hook cleanup).
    fireEvent.click(toggle())
    expect(panel()).toBeNull()

    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('removes the listener on unmount', () => {
    const onClose = vi.fn()
    const view = render(<Harness onClose={onClose} />)

    fireEvent.click(toggle())
    view.unmount()

    fireEvent.pointerDown(document.body)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays inert (no crash) when no onClose is provided', () => {
    render(<Harness />)

    fireEvent.click(toggle())
    expect(panel()).not.toBeNull()
    expect(() => fireEvent.pointerDown(document.body)).not.toThrow()
    expect(panel()).not.toBeNull()
  })
})