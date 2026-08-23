/**
 * modal-tokens: the ONE source for the settings modal's dark-panel palette and
 * radius scale, shared with the 0.6.4 onboarding tutorial modal so the two
 * dialogs cannot drift (same dark panel on a dark host, same three text tiers,
 * same 12px panel / 8px control radius, same border tone).
 *
 * The static MODAL_CSS block (hover/focus-visible/reduced-motion rules) stays
 * in MilestoneRail.tsx because it also styles the settings modal's own chrome
 * (`[data-support-card]`, `[data-toolbar-*]`, ...); the onboarding modal
 * carries its own small ONBOARDING_CSS block for its own controls, built from
 * these same tokens. MilestoneRail.tsx imports these constants verbatim so a
 * future palette change edits exactly one file.
 */
export const MODAL_BG = 'rgba(20, 24, 32, 0.98)'
export const MODAL_FG = '#e6e8ee'
export const MODAL_TITLE = '#c7cede'
export const MODAL_TEXT = '#b9c2d4'
export const MODAL_HINT = '#8b96ab'
export const MODAL_BORDER = 'rgba(255, 255, 255, 0.14)'
export const MODAL_TIP_BG = '#222834'
export const MODAL_RADIUS_PANEL = 12
export const MODAL_RADIUS_CONTROL = 8