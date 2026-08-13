/**
 * Regression guard for the client entry's cordis inject contract.
 *
 * F3 added an inject factory that reads `ctx.sessions`, but the `inject`
 * export only declared `['slots']` — cordis then threw
 * "cannot get property 'sessions' without inject" at runtime and the whole
 * milestone.rail entry crashed (dots disappeared). Unit tests never caught it
 * because they mock `loadOlder` and never exercise the real `apply()`.
 *
 * This pins the inject declaration to the services `apply()` actually reads,
 * so removing a declaration fails loudly here instead of in the browser.
 */
import { describe, expect, it } from 'vitest'
import { inject } from './index.ts'

describe('client index inject contract', () => {
  it('declares every service apply() reads', () => {
    // apply() reads ctx.slots (register/inject), ctx.sessions (in the
    // milestone.rail inject factory → createLoadOlder/createForkAt), and
    // ctx.locale (the dsh-milestone dictionary registration).
    expect(inject).toContain('slots')
    expect(inject).toContain('sessions')
    expect(inject).toContain('locale')
  })
})
