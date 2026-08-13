/**
 * Shared vitest setup for dsh-milestone unit/component tests.
 *
 * - Registers jest-dom matchers on vitest's expect.
 * - Stubs browser APIs jsdom does not implement so components (MilestoneRail
 *   observes the scrollport through ResizeObserver; rails and chat rows call
 *   scrollIntoView) can mount without exploding.
 */
import '@testing-library/jest-dom/vitest'

/** jsdom has no ResizeObserver; no-op so layout observation never throws. */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

/** jsdom has no IntersectionObserver; no-op for any viewport-intersection use. */
class IntersectionObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.assign(globalThis, {
  ResizeObserver: ResizeObserverStub,
  IntersectionObserver: IntersectionObserverStub,
})

/** jsdom lacks scrollIntoView; no-op so smooth-scroll calls never throw. */
Element.prototype.scrollIntoView = (): void => {}
