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

/**
 * jsdom exposes window.localStorage only for http(s) documents. Under an
 * opaque origin (about:blank — the default in some vitest/jsdom versions)
 * accessing it throws "localStorage is not available for opaque origins",
 * which broke the toolbar-prefs / version-logic suites on clean clones
 * (Linux, Node 22). vitest.config.ts pins a non-opaque jsdom URL; this
 * polyfill additionally guarantees a working store if the probe fails, so
 * the suites are deterministic in any environment.
 */
function installLocalStorage(): void {
  const probe = (): boolean => {
    try {
      const key = '__dsh_milestone_ls_probe__'
      window.localStorage.setItem(key, '1')
      window.localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  }
  if (probe()) return

  const backing = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return backing.size
    },
    clear() {
      backing.clear()
    },
    getItem(key: string) {
      return backing.has(key) ? backing.get(key)! : null
    },
    key(index: number) {
      return [...backing.keys()][index] ?? null
    },
    removeItem(key: string) {
      backing.delete(key)
    },
    setItem(key: string, value: string) {
      backing.set(key, String(value))
    },
  }
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memory,
  })
}

installLocalStorage()
