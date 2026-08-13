/**
 * Component-test helper: renders MilestoneRail over a ConversationSnapshot
 * fixture inside the DOM shape the harness provides, so component tests can
 * drive the rail's real DOM (dots, search panel, anchors) without the slot
 * machinery.
 *
 * - `useSession` is stubbed as `(selector) => selector(snapshot)`: every
 *   selector call the component makes re-reads the same frozen snapshot.
 * - A `[data-conversation-scroll]` wrapper holds one `[data-chat-anchor-key]`
 *   row per user message (the anchors `findRow` jumps to) and the rail.
 *
 * The rail's real `PropsRuntime<'milestone.rail'>` includes the framework's
 * standard kit and declaration-merge machinery that tests do not construct;
 * per the F1 test spec the props object uses a local structural type with a
 * single cast at the render call (no `any`).
 */
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { MilestoneRail } from '../client/MilestoneRail.tsx'
import type { MilestoneRailProps } from '../client/MilestoneRail.tsx'
import type { ConversationSnapshotFixture } from './snapshot-fixture.ts'
import { buildSnapshot } from './snapshot-fixture.ts'

export interface RailUser {
  key: string
  seq: number
  time: number
  text: string
}

/** Structural stand-in for the session standard kit the rail consumes. */
export interface RailTestProps {
  useSession: (selector: (snapshot: ConversationSnapshotFixture) => unknown) => unknown
  sessionId: string
  useProjection: (key?: string) => unknown
  loadOlder: () => Promise<void>
}

/**
 * Render the rail over a fixture conversation.
 * @param users - user messages in conversation order (one mark + one anchor
 *   row each); the `text` is the full message body (search matches on it).
 * @returns the snapshot, the loadOlder mock, and testing-library's render
 *   result (`container` for scoped queries).
 */
export function renderRail(users: RailUser[]) {
  const snapshot = buildSnapshot({ users })
  const useSession: RailTestProps['useSession'] = (selector) => selector(snapshot)
  const loadOlder = vi.fn(async () => {})
  const useProjection: RailTestProps['useProjection'] = () => undefined

  const props = {
    useSession,
    sessionId: 'fixture',
    useProjection,
    loadOlder,
  } as unknown as MilestoneRailProps

  const result = render(
    <div data-conversation-scroll>
      <div style={{ height: 400 }}>
        {users.map((user) => (
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
