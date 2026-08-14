/**
 * dsh-milestone browser half. Two registrations:
 *   1. MilestoneOverlay into the frame-wide `shell.overlay` seat (root scope)
 *      declaring a session-scoped child `milestone.rail`, then bridging into
 *      that session area through the framework-injected SessionProvider.
 *   2. MilestoneRail into that child seat (session scope), where it reads the
 *      conversation snapshot through the standard `useSession` hook.
 *
 * `shell.overlay` is declared by ui-layout and `milestone.rail` is declared by
 * our own overlay entry, so both registrations go through `ctx.slots.inject`
 * and follow their declaration lifetimes.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale.register).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Establishes the module reference the SlotMap declaration merge below extends.
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Pulls ui-layout's SlotMap declaration for the frame-wide `shell.overlay` seat
// (kind: 'list', scope: 'root') into this compilation; without it the key is
// not a member of SlotMap and register/PropsRuntime reject it.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import { MilestoneOverlay } from './MilestoneOverlay.tsx'
import { MilestoneRail } from './MilestoneRail.tsx'
import { createBookmarksStore } from './bookmarkStore.ts'
import { createForkAt, createLoadOlder, createOpenSession, createSessionSearch } from './railInject.ts'
import { en, zh, type MilestoneKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * dsh-milestone's session-scoped rail seat, declared by our own
     * `shell.overlay` entry so the overlay can render a per-session rail
     * through the framework SessionProvider.
     */
    'milestone.rail': { kind: 'single'; scope: 'session' }
  }
  interface LocaleNamespaceMap {
    /** Dictionary namespace of the milestone rail copy (locales.ts). */
    'dsh-milestone': MilestoneKey
  }
}

/** Required services (cordis fiber inject). */
export const inject = ['slots', 'sessions', 'locale']

/**
 * Register the overlay and rail once their slot declarations are on the
 * ledger. The overlay registers directly against the shipped shell.overlay
 * declaration; the rail registers against our own child declaration, which
 * appears exactly when the overlay entry mounts.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register('dsh-milestone', { zh, en }), 'dsh-milestone: dictionaries')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    {
      name: 'shell.overlay',
      id: 'milestone',
      order: 100,
      children: { 'milestone.rail': { kind: 'single', scope: 'session' } },
    },
    MilestoneOverlay,
  ))
  ctx.slots.inject('milestone.rail', () => ctx.slots.register(
    // T10: store seat — a store FACTORY (framework instantiates per session
    // scope and injects the `useStore` selector hook + baked `actions` onto
    // the component props via PropsStore<H>). F3/F9: session-scoped inject
    // face — the rail receives binding-safe `loadOlder` + `forkAt` actions
    // for its own session, plus the cross-session `searchSessions` /
    // `openSession` actions (railInject.ts). `ctx.sessions` (ISessions)
    // satisfies the structural faces directly. The inject
    // factory keeps its single-parameter shape: the framework appends the
    // baked store actions as a second positional arg, which a one-arg
    // factory simply ignores.
    {
      name: 'milestone.rail',
      store: createBookmarksStore,
      locale: 'dsh-milestone',
      inject: (sessionId) => ({
        loadOlder: createLoadOlder(ctx.sessions, sessionId),
        forkAt: createForkAt(ctx.sessions, sessionId),
        searchSessions: createSessionSearch(ctx.sessions),
        openSession: createOpenSession(ctx.sessions),
      }),
    },
    MilestoneRail,
  ))
}
