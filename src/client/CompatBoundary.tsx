/**
 * Compatibility boundary for both plugin surfaces.
 *
 * The plugin consumes the framework's session standard kit (`useSession`,
 * `useProjection`, the store seat) and the slot registry, all of which a DSH
 * upgrade may rename or reshape. Without a boundary such a failure throws out
 * of the plugin's render — and when the registry silently ignores a stale
 * entry the rail simply vanishes with no explanation.
 *
 * The boundary converts any throw into ONE compact, honest notice instead: the
 * surrounding harness keeps working, and the user is told what to do (0.1.2→
 * 0.1.5 has already shown that these upgrades do break third-party plugins).
 *
 * A class boundary rather than a per-render capability probe is deliberate:
 * React exposes error boundaries only through class components, and swapping
 * hook implementations based on a runtime probe would break hook order.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { MODAL_BG, MODAL_BORDER, MODAL_HINT, MODAL_RADIUS_PANEL } from './modal-tokens'
import { MilestoneOverlay, type MilestoneOverlayProps } from './MilestoneOverlay.tsx'
import { MilestoneRail, type MilestoneRailProps } from './MilestoneRail.tsx'

interface BoundaryProps {
  readonly children: ReactNode
}

interface BoundaryState {
  readonly failed: boolean
}

/** Catches a render failure anywhere below and shows the incompatibility notice. */
export class CompatBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // One actionable line for a bug report; the notice below is the user-facing half.
    console.error(
      '[dsh-milestone] incompatible with this DSH version — the rail is disabled. ' +
        'Please update dsh-milestone (or pin an older DSH).',
      error,
      info.componentStack,
    )
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div
        data-milestone-incompatible
        role="status"
        style={{
          position: 'fixed',
          right: 14,
          bottom: 14,
          zIndex: 100,
          maxWidth: 300,
          padding: '10px 12px',
          background: MODAL_BG,
          color: MODAL_HINT,
          border: `1px solid ${MODAL_BORDER}`,
          borderRadius: MODAL_RADIUS_PANEL,
          fontSize: 12,
          lineHeight: 1.5,
          fontFamily: 'inherit',
        }}
      >
        dsh-milestone 与当前 DSH 版本不兼容，已停用。请升级插件。
        <br />
        Incompatible with this DSH version — please update dsh-milestone.
      </div>
    )
  }
}

/** The `shell.overlay` seat wrapped in the compatibility boundary. */
export function GuardedMilestoneOverlay(props: MilestoneOverlayProps) {
  return (
    <CompatBoundary>
      <MilestoneOverlay {...props} />
    </CompatBoundary>
  )
}

/** The `milestone.rail` seat wrapped in the compatibility boundary. */
export function GuardedMilestoneRail(props: MilestoneRailProps) {
  return (
    <CompatBoundary>
      <MilestoneRail {...props} />
    </CompatBoundary>
  )
}
