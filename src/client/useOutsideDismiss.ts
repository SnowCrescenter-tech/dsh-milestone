/**
 * useOutsideDismiss: the shared "click outside to dismiss" contract behind the
 * rail's floating panels (in-rail search / all-prompts list / cross-session
 * search). While a panel is open, a pointerdown anywhere OUTSIDE it calls the
 * caller's close handler; a pointerdown inside the panel (or on an excluded
 * element) is left untouched.
 *
 * Event choice — window `pointerdown`:
 *   - `pointerdown` unifies mouse / touch / pen, so dismissal works for every
 *     input the harness surfaces; a `mousedown`-only listener would miss
 *     touch taps entirely.
 *   - Closing on the DOWN side of the gesture feels instant — the panel is
 *     gone before the pointer is released, which is the expected behaviour
 *     for fixed floating layers.
 *
 * Lifecycle: the listener is attached ONLY while `open` and removed on close
 * / unmount, so a closed panel never intercepts events and no listener leaks.
 *
 * Opening-gesture guard: hooks arm their listener in an effect, which React
 * runs AFTER the toggle's pointerdown/click that opened the panel — that
 * gesture can therefore never reach the listener by construction. As
 * defense-in-depth the hook also records its arming time and drops any
 * pointerdown whose `timeStamp` STRICTLY predates it (an event still in
 * flight from the opening gesture). Same-tick and later events pass through,
 * and synthetic test events with `timeStamp === 0` (which carry no real
 * timestamp) are kept — the guard never swallows a legitimate dispatch.
 *
 * `options.exclude` names targets the caller keeps for its own handler — the
 * panel's own toggle button is the canonical case: its click owns the
 * open/close flip, so a pointerdown on it must NOT also dismiss through the
 * hook, or clicking an armed toggle would close on pointerdown and re-open on
 * click.
 */
import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

export interface OutsideDismissOptions {
  /**
   * Ignore pointerdowns whose target satisfies this predicate — e.g. the
   * panel's own toggle button, whose click owns the toggle logic.
   */
  readonly exclude?: (target: EventTarget | null) => boolean
}

/**
 * True when `target` is (or sits inside) an element matching `selector`.
 * Panels use it to exclude their own rail-top toggle from dismissal (the
 * toggle's data attribute is the established rail DOM contract, so the
 * exclusion is just another access to it).
 */
export function outsideDismissMatches(target: EventTarget | null, selector: string): boolean {
  return target instanceof Element && target.closest(selector) !== null
}

/**
 * @param panelRef - the floating panel's root element (only mounted while open).
 * @param open - whether the panel is open; the window listener arms only when true.
 * @param onClose - called once per outside pointerdown. `undefined` keeps the
 *   hook inert — used while a call site still has no close path wired.
 * @param options - optional exclusion predicate (see {@link OutsideDismissOptions}).
 */
export function useOutsideDismiss(
  panelRef: RefObject<HTMLElement>,
  open: boolean,
  onClose: (() => void) | undefined,
  options?: OutsideDismissOptions,
): void {
  // Keep the callbacks in refs so the arming effect never re-runs on new
  // closure identities: the rail feeds inline arrow props and the search
  // panel re-renders on every keystroke, so depending on `onClose` directly
  // would churn the window listener on every render.
  const onCloseRef = useRef(onClose)
  const excludeRef = useRef(options?.exclude)
  useEffect(() => {
    onCloseRef.current = onClose
    excludeRef.current = options?.exclude
  })

  useEffect(() => {
    if (!open) return
    // Arming time — see the file header for the opening-gesture guard.
    const armedAt = performance.now()
    const onPointerDown = (e: PointerEvent): void => {
      const onClose = onCloseRef.current
      if (onClose === undefined) return
      // An event that predates listener arming is part of the gesture that
      // OPENED the panel — never dismiss on it. `timeStamp === 0` synthetic
      // events carry no real timestamp and are kept (see header).
      if (e.timeStamp > 0 && e.timeStamp < armedAt) return
      // Excluded targets (the panel's own toggle) belong to the caller.
      if (excludeRef.current?.(e.target)) return
      // A pointerdown inside the panel is the panel's own business.
      const panel = panelRef.current
      if (panel !== null && e.target instanceof Node && panel.contains(e.target)) return
      onClose()
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open, panelRef])
}