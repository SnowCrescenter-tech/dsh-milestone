/**
 * MilestoneOverlay: the shell.overlay entry (root scope). It declares the
 * session-scoped `milestone.rail` child, so the framework hands it the
 * `SessionProvider` seat (PropsRenderSlots derives it from the child scope).
 * It then renders the rail inside that session area: no session, no rail.
 */
import type { PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export type MilestoneOverlayProps = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'milestone.rail'>

/**
 * @param props - runtime share (root kit) + the narrowed renderSlot and the
 *   framework-injected SessionProvider for the session child seat.
 */
export function MilestoneOverlay({ SessionProvider, renderSlot }: MilestoneOverlayProps) {
  return (
    <SessionProvider empty={() => null}>
      {() => renderSlot('milestone.rail', {})}
    </SessionProvider>
  )
}
