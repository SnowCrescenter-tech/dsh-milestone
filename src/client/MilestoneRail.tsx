/**
 * MilestoneRail: the milestone.rail entry (session scope). Renders a fixed
 * side vertical scrubber as a **fixed-pitch dot list** (like a git commit
 * graph), NOT a minimap: one dot per user message, equal spacing regardless of
 * conversation length. The list itself scrolls with the wheel when it outgrows
 * the viewport; hovering a dot shows rich metadata (time, turn, duration, end
 * reason, TTFT, tokens/sec) and clicking jumps the chat to that message.
 *
 * Data sources (all from the session-scoped `useSession` snapshot):
 *   - chat.order + chat.nodes.get(key)  -> user-message nodes (key/id/location)
 *   - chat.timeline.turns.get(turn)     -> turn start/end time, status, reason,
 *                                          and the ui-conversation 'turn-tail'
 *                                          location data (ttftMs/tokensPerSecond)
 *
 * Positioning: the rail hugs the conversation scrollport's chosen screen edge
 * (settings 位置: left or right), offset a little inward so it clears the
 * native scrollbar and sits near the prose.
 *
 * In-rail search (F1): a magnifier toggle at the rail top opens a compact
 * panel on the rail's free side with a message-text search input; matches
 * light up the dots (non-matches dim), Enter cycles the active match
 * (wrapping) and jumps to it, Escape clears and closes. Matching runs over the
 * FULL message text (`text` from rail-logic.extractText), not the truncated
 * hover preview.
 *
 * Current-position highlight (F2): the dot for the user message at/just above
 * the conversation viewport top carries a white ring (`useCurrentAnchor`
 * observes the scrollport, no polling).
 *
 * Load-older + window coverage (F3): when the session still has earlier pages
 * (`hasMore`) a slim `···` button sits at the rail top and triggers the
 * injected `loadOlder` action (disabled + `data-loading-older` while
 * `loadingOlder`), and a compact hint on the rail's free side states how many
 * messages the current window covers.
 *
 * Settings (B-design): the gear is a REGULAR toolbar feature ("settings",
 * registry last, default unpinned) — the collapsed rail shows only the expand
 * arrow plus the user's pinned keys, and expanding reveals the gear at the end
 * of the queue. The gear opens a CENTERED modal dialog (function-key pins /
 * hover descriptions, the personalization controls, and the support-us card
 * grid); everything the modal changes persists under `dsh-milestone.toolbar`.
 */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { badgePulseCss, badgeRingStyle, deriveBadge } from './badge-logic'
import type { BadgeKind } from './badge-logic'
import type { createBookmarksStore } from './bookmarkStore.ts'
import { filterByBookmarks, isBookmarked } from './bookmark-logic'
import { copyText } from './clipboard-logic'
import { buildMessageHash, parseDeepLinkHash } from './deep-link-logic'
import { reasonKeyOf } from './label-logic'
import { deriveTurnMeta } from './tooltip-logic'
import { clampIndex, nextFocusIndex } from './rail-keyboard'
import { dotColor, extractText, filterMarks, markState, nextMatchIndex } from './rail-logic'
import { en, translateDict, zh, type MilestoneKey } from './locales.ts'
import { buildDisplayTurns, buildRenderList, buildTurnGroups } from './turn-group-logic'
import { RailSearchUi } from './MilestoneRailSearch.tsx'
import { MilestoneListPanel } from './MilestoneListPanel.tsx'
import { MilestoneTour } from './MilestoneTour.tsx'
import { MilestoneRailTooltip } from './MilestoneRailTooltip.tsx'
import { MilestoneSessionSearch } from './MilestoneSessionSearch.tsx'
import type { SearchSessionsFn } from './MilestoneSessionSearch.tsx'
import { readOnboardedFlag } from './onboarding-store'
import { useCurrentAnchor } from './useCurrentAnchor.ts'
import { outsideDismissMatches, useOutsideDismiss } from './useOutsideDismiss.ts'
import { DEFAULT_PREFS, loadPrefs, savePrefs, togglePin } from './toolbar-prefs.ts'
import type { FocusPrefs, RailSide, ToolbarPinId, ToolbarPrefs } from './toolbar-prefs.ts'
import { lighten, rgbaString } from './accent-utils'
import { loadCachedLatest, needsUpdate, SUPPORTED_HOST_LINES } from './version-logic.ts'
import { PLUGIN_NPM_URL, PLUGIN_REPO_URL, PLUGIN_VERSION } from './version-meta.ts'

/**
 * F3 inject face: the rail entry registers an `inject` factory (index.ts)
 * binding the session-bound `loadOlder` action and the cross-session
 * `searchSessions`/`openSession` actions (see railInject.ts); the framework
 * spreads them onto the props at render time.
 *
 * T10 store seat: `index.ts` declares `store: createBookmarksStore`, so the
 * framework instantiates a per-session bookmarks store and injects the
 * `useStore` selector hook + baked `actions` onto the props via
 * `PropsStore<H>` (`H` = the store handle the factory returns).
 */
export type MilestoneRailProps = PropsRuntime<'milestone.rail'> &
  InjectFace<{
    loadOlder: () => Promise<void>
    forkAt: (atSeq: number) => Promise<string>
    searchSessions: SearchSessionsFn
    openSession: (id: string) => void
  }> &
  PropsStore<ReturnType<typeof createBookmarksStore>> &
  PropsLocale<'dsh-milestone'>

/** Minimum user messages before the rail adds value. */
const MIN_MARKS = 2
const PREVIEW_LENGTH = 80
/** Stable no-bookmarks fallback for render paths without the store seat. */
const NO_BOOKMARKS: readonly string[] = []
/** Stable no-kinds fallback for marks whose turn carries no badge nodes. */
const NO_KINDS: readonly string[] = []
/** Visual dot diameter at the default icon size (px). */
const DOT_SIZE = 14
/** Hit area per dot at the default icon size (px) — larger than the dot. */
const DOT_HIT = 28
/** Vertical gap between dot hit areas at the default icon size (px). */
const DOT_GAP = 14
/**
 * Extra top margin a new turn group's FIRST dot gets (replaces the old
 * `data-turn-separator` line): same-group pitch stays DOT_GAP, a group
 * boundary opens another GROUP_GAP_EXTRA px (14 → 18 at default size),
 * expressed purely as spacing — no line element.
 */
const GROUP_GAP_EXTRA = 4
/**
 * Preset accent swatches for the settings 强调色 row (default blue first).
 * The custom color input accepts any #rrggbb.
 */
const ACCENT_PRESETS: readonly string[] = [
  '#4d7cfd',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
  '#ec4899',
  '#f97316',
]
/** Known floating-panel widths (px) used to anchor side=left panels to the
 * rail's free (right) side — the panel components take a viewport `right`
 * offset, so a left rail must back-calculate it from the panel width. */
const PANEL_WIDTH_SEARCH = 220
const PANEL_WIDTH_STANDARD = 280
/** Tooltip anchor width: its maxWidth cap, so a tooltip never overlaps the rail. */
const TOOLTIP_ANCHOR_WIDTH = 300
/**
 * P3 focus mode (0.6.3: user-tuned "聚焦搭配"): when the eye toggle is armed,
 * an inline <style> (zero-asset, same pattern as the original FOCUS_CSS)
 * dims/collapses the harness content classes the USER opted into, at the
 * strength the user picked. Which content to dim and whether to additionally
 * collapse think is a persisted `prefs.focus` mix; the master on/off switch
 * stays the toolbar eye button.
 *
 * STABLE SELECTORS — researched against the rc.2 official build products:
 *
 *  - think: `dsh-client-ui-conversation` renders every assistant reasoning
 *    disclosure as a root `div[data-variant="think"][data-state="running|ok"]`
 *    (ReasoningRow). The reasoning body lives INSIDE that root — the
 *    DisclosureRow's children — so the root is a single clampable container:
 *    CSS `max-height` + `overflow: hidden` collapses exactly the body while
 *    the header row ("Think · summary") stays visible. → collapseThink is
 *    feasible with pure CSS (no JS, no harness-internal interaction).
 *
 *  - tool calls: `dsh-client-ui-tool` wraps EVERY atomic call (all ToolRow
 *    presentation variants AND the bash-sample row) in
 *    `div[data-chat-call-id]` (with `data-chat-anchor-key="call:<callId>"`);
 *    no other card type in the harness uses that attribute (verified across
 *    the whole @deepseek-ai install). → `[data-chat-call-id]` is the stable,
 *    variant-independent tool-call-card selector.
 *
 * Hover/open restore mirrors the classic rule: `:hover` restores, and the
 * DisclosureRow inside the collapsed target sets `[data-open]` when the user
 * opens it (the DESCENDANT form `target [data-open]` is required — same as
 * pre-0.6.3). The collapse strip releases on hover AND on `[data-open]` so
 * an opened think disclosure never stays crushed.
 */
export const FOCUS_SELECTOR_THINK = '[data-variant="think"]'
export const FOCUS_SELECTOR_TOOL = '[data-chat-call-id]'
/** Collapsed think strip height (px) — roughly one header line. */
export const FOCUS_THINK_STRIP_HEIGHT = 36
/** Restored height when hovering/opening a collapsed think disclosure. */
export const FOCUS_THINK_MAX_HEIGHT = '78vh'

/**
 * Compose the focus-mode stylesheet from the persisted focus mix. Pure —
 * exported so unit tests can pin the exact rule text. `''` when no option is
 * armed (the master switch simply injects nothing).
 */
export function buildFocusCss(focus: FocusPrefs): string {
  const { dimThink, dimTools, collapseThink } = focus
  const strength = focus.opacity.toFixed(1)
  const rules: string[] = []
  if (dimThink || collapseThink) {
    const decls: string[] = []
    if (dimThink) decls.push(`opacity: ${strength}`)
    if (collapseThink) {
      decls.push(`max-height: ${FOCUS_THINK_STRIP_HEIGHT}px`, 'overflow: hidden')
    }
    rules.push(
      `${FOCUS_SELECTOR_THINK} { ${decls.join('; ')}; transition: opacity 0.2s${collapseThink ? ', max-height 0.2s' : ''}; }`,
    )
    rules.push(
      `${FOCUS_SELECTOR_THINK}:hover, ${FOCUS_SELECTOR_THINK} [data-open] { opacity: 1;${collapseThink ? ` max-height: ${FOCUS_THINK_MAX_HEIGHT};` : ''} }`,
    )
  }
  if (dimTools) {
    rules.push(`${FOCUS_SELECTOR_TOOL} { opacity: ${strength}; transition: opacity 0.2s; }`)
    rules.push(`${FOCUS_SELECTOR_TOOL}:hover, ${FOCUS_SELECTOR_TOOL} [data-open] { opacity: 1; }`)
  }
  return rules.join('\n')
}
/**
 * Settings modal shared palette + geometry — ONE source in modal-tokens.ts,
 * also consumed by the 0.6.4 onboarding tutorial modal so the two dialogs
 * cannot drift. Dark panel on a dark host, three text tiers (primary /
 * section title / hint + muted), one border tone, a 12px panel / 8px control
 * radius scale and a 4-unit spacing scale (4 / 8 / 12 / 16 / 20).
 */
import {
  MODAL_BG,
  MODAL_FG,
  MODAL_TITLE,
  MODAL_TEXT,
  MODAL_HINT,
  MODAL_BORDER,
  MODAL_TIP_BG,
  MODAL_RADIUS_PANEL,
  MODAL_RADIUS_CONTROL,
} from './modal-tokens'
/** Near-row description tip: how far its right edge sits from the row's right
 * edge — clears the 32px switch + its 10px padding. */
const MODAL_TIP_RIGHT = 54
/**
 * Static settings-modal styling that needs `:hover`/`:focus-visible` (which
 * inline styles cannot express): the support-us card grid (micro-lift +
 * accent highlight), the pin-row / personal-header hover washes, one accent
 * focus ring for every modal control, the near-row tip's little arrow, the
 * personalization body's reveal, and a themed thin scrollbar. Accent values
 * come from the rail root's CSS variables (`--ms-accent*`), so one block
 * serves every accent. Inline styles keep these elements background-free
 * (except where noted) so the `:hover` washes below actually win. The
 * search-toggle recolor rule makes the EXTERNAL RailSearchUi chrome follow
 * the accent too (that file is owned by an earlier phase and cannot change);
 * `!important` is required because that toggle's own inline styles win
 * otherwise.
 */
const MODAL_CSS = `
[data-support-card] {
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 12px; border-radius: 8px;
  background: rgba(255, 255, 255, 0.05); border: 1px solid ${MODAL_BORDER};
  color: #c7cede; text-decoration: none; font-size: 12.5px; line-height: 1.4;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}
[data-support-card]:hover { transform: translateY(-2px); border-color: var(--ms-accent); background: rgba(255, 255, 255, 0.09); }
/* Row and header washes (the inline styles deliberately leave backgrounds
   unset so these rules win over the default padding-box background). */
[data-toolbar-pin-toggle]:hover, [data-toolbar-pin-toggle]:focus-visible { background: rgba(255, 255, 255, 0.06); }
[data-personal-toggle]:hover, [data-focus-toggle-settings]:hover { background: rgba(255, 255, 255, 0.05); }
[data-focus-option]:hover { background: rgba(255, 255, 255, 0.04); }
[data-toolbar-settings-close]:hover { background: rgba(255, 255, 255, 0.08); }
[data-toolbar-settings-reset], [data-onboarding-reopen] { background: rgba(255, 255, 255, 0.06); }
[data-toolbar-settings-reset]:hover, [data-onboarding-reopen]:hover { background: rgba(255, 255, 255, 0.1); }
/* BASE state reset: every modal surface must sit transparent on the dark
   panel — without it the UA default button face (light gray) floods through
   and rows become unreadable light-on-light. Hover washes above take over
   on interaction. */
[data-toolbar-pin-toggle], [data-personal-toggle], [data-focus-toggle-settings],
[data-toolbar-settings-close], [data-focus-option] {
  background: transparent;
}
/* ONE accent ring for keyboard focus on every modal control. */
[data-toolbar-pin-toggle]:focus-visible, [data-personal-toggle]:focus-visible,
[data-focus-toggle-settings]:focus-visible,
[data-toolbar-settings-close]:focus-visible, [data-toolbar-settings-reset]:focus-visible,
[data-onboarding-reopen]:focus-visible {
  box-shadow: 0 0 0 2px var(--ms-accent-soft);
}
/* Near-row description tip: a rotated square peeks out of the LEFT edge so
   the apex points back at the row's label. */
[data-settings-tip]::before {
  content: ''; position: absolute; left: -3px; top: 50%;
  width: 7px; height: 7px; transform: translateY(-50%) rotate(45deg);
  background: ${MODAL_TIP_BG};
  border-left: 1px solid ${MODAL_BORDER};
  border-bottom: 1px solid ${MODAL_BORDER};
}
/* Tip + chevron motion lives here (not inline) so reduced-motion can kill it. */
[data-settings-tip] { transition: opacity 140ms ease, transform 140ms ease, visibility 140ms; }
[data-personal-toggle] svg, [data-focus-toggle-settings] svg { transition: transform 150ms ease; }
/* One authored reveal: the personalization/focus bodies fade in on expand. */
@keyframes ms-settings-fade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
[data-settings-personal-body], [data-settings-focus-body] { animation: ms-settings-fade 140ms ease; }
/* Thin themed scrollbar for the scrollable modal panel. */
[data-toolbar-settings-panel]::-webkit-scrollbar { width: 10px; }
[data-toolbar-settings-panel]::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.16); border-radius: 6px; border: 3px solid transparent; background-clip: padding-box;
}
[data-toolbar-settings-panel]::-webkit-scrollbar-track { background: transparent; }
@media (prefers-reduced-motion: reduce) {
  [data-settings-tip], [data-personal-toggle] svg, [data-focus-toggle-settings] svg, [data-support-card] { transition: none; }
  [data-settings-personal-body], [data-settings-focus-body] { animation: none; }
}
[data-search-toggle] { color: #8b96ab !important; }
[data-search-toggle][aria-pressed="true"] { background: var(--ms-accent-bg) !important; color: var(--ms-accent-soft) !important; }
`
/**
 * Shared collapsible-section chrome (personalization + focus blocks): the
 * header button (chevron + title + live summary) and the summary text span.
 * One source so the two settings blocks cannot drift.
 */
const SECTION_TOGGLE_STYLE: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  width: '100%',
  padding: '8px 10px',
  border: 'none',
  borderRadius: MODAL_RADIUS_CONTROL,
  cursor: 'pointer',
  color: MODAL_TITLE,
  fontSize: 13,
  fontWeight: 600,
  textAlign: 'left',
}
const SECTION_SUMMARY_STYLE: CSSProperties = {
  flex: 1,
  minWidth: 0,
  textAlign: 'right',
  fontWeight: 400,
  fontSize: 12,
  color: MODAL_HINT,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}
/**
 * P3 deep links (`#msg=<anchor-key>`): initial delay before the first
 * deep-link attempt — the harness scrolls the conversation to the bottom on
 * load, so the deep link must land AFTER the view mounts.
 */
const DEEP_LINK_INITIAL_DELAY = 100
/** P3: interval between DOM-row polls while waiting for the target to render. */
const DEEP_LINK_POLL_DELAY = 150
/** P3: polls before falling back to a single `loadOlder` fetch. */
const DEEP_LINK_MAX_POLLS = 5
/** P3: bounded polls after `loadOlder`, then the deep link gives up silently. */
const DEEP_LINK_MAX_RETRY_POLLS = 5
/** B4 update-check: mount-time silent check delay (ms) — give the harness
 * time to settle before hitting the registry. */
const UPDATE_CHECK_MOUNT_DELAY = 1500
/** 0.6.5 first-run coach tour: mount-time show delay (ms) — let the rail settle
 * before the first bubble pops. */
const ONBOARDING_MOUNT_DELAY = 800

/** One user message: its node key (DOM anchor), turn, and payload bits. */
interface MilestoneMark {
  readonly key: string
  readonly turn: number | undefined
  readonly seq: number
  readonly time: number
  /** FULL plain text of the message — the search corpus (never truncated). */
  readonly text: string
  /** First 80 chars of the message — the hover tooltip preview. */
  readonly preview: string
}

/** In-rail search state (F1). */
interface SearchState {
  readonly query: string
  /** Position within the CURRENT match list (not a mark index). */
  readonly activePos: number
  readonly panelOpen: boolean
}

/**
 * One entry of the collapsible toolbar's data-driven feature registry (the
 * "top function-key area"): the persisted pin id, the settings-menu display
 * label key, and the rail-top JSX (the toggle button, and for `search` the
 * whole RailSearchUi chrome). Pinning is purely id-driven — a feature renders
 * while the toolbar is EXPANDED or while its id is in the persisted `pinned`
 * set — so adding a feature is a registry-only change (plus its locale keys).
 *
 * `settings` is a REGULAR feature since the B-design move (id added last,
 * default unpinned): the gear only renders while the toolbar is expanded (or
 * when pinned), satisfying "settings must stay reachable" via 展开→齿轮 while
 * keeping the collapsed rail to just the arrow + pinned keys.
 *
 * EXTENSION POINT (integration): to add a future function key (e.g. the B4
 * update-check button), push an entry with a new `id` to `toolbarFeatures`
 * below — pinning/persistence/settings-menu listing then work automatically.
 * The `id` whitelist lives in toolbar-prefs.ts (`TOOLBAR_PIN_IDS`), which
 * types every id here as `ToolbarPinId`, so a new id MUST be added there too
 * (one line) for its pin toggle to survive the read-time sanitizer.
 */
interface ToolbarFeatureDef {
  readonly id: ToolbarPinId
  /** Settings-menu display name (resolved through `t`). */
  readonly labelKey: MilestoneKey
  /** Renders the feature's rail-top chrome (button, or RailSearchUi for search). */
  readonly render: () => ReactNode
}

/**
 * B4 update-check state: the result of the last check (auto on mount, manual,
 * or retry) plus the in-flight phase. `available` is the needsUpdate verdict
 * computed at check-completion time — never recomputed during render, so a
 * registry anomaly (unparseable `latest`) degrades to "not available" instead
 * of throwing mid-render.
 */
interface UpdateCheckState {
  readonly phase: 'idle' | 'checking' | 'ok' | 'failed'
  readonly latest: string | null
  readonly source: 'npmmirror' | 'npm' | null
  readonly error: string | null
  readonly available: boolean
}

/** Initial state: no check has completed yet, nothing to show. */
const NO_UPDATE_CHECK: UpdateCheckState = { phase: 'idle', latest: null, source: null, error: null, available: false }

/**
 * B4 display label for one supported host line: strips the fixed
 * `x.y.z` prefix and appends "line" — `0.1.1-rc.2` → `rc.2 line`,
 * `0.1.1` → `0.1.1 line`. Pure presentation metadata.
 */
function hostLineLabel(line: string): string {
  const suffix = line.replace(/^\d+\.\d+\.\d+-?/, '')
  return suffix === '' ? `${line} line` : `${suffix} line`
}

interface RailBox {
  readonly top: number
  readonly height: number
  /** Distance from the viewport RIGHT edge to the rail (side=right anchor). */
  readonly right: number
  /** Distance from the viewport LEFT edge to the rail (side=left anchor). */
  readonly left: number
}

/** Hovered-dot metadata fed to the hover tooltip (MilestoneRailTooltip). */
export interface HoverInfo {
  readonly mark: MilestoneMark
  readonly index: number
  readonly total: number
  /**
   * Localized position line: `第 {n} / {m} 条` for a normal dot, `第 {a}–{b}
   * / {m} 条` (the message RANGE) for a collapsed turn's summary dot.
   */
  readonly posLabel: string
  readonly turnLabel: string | null
  readonly durationLabel: string | null
  readonly reasonLabel: string | null
  readonly ttftLabel: string | null
  readonly tpsLabel: string | null
  /** C2: the model that answered the turn, when the assistant step recorded one. */
  readonly modelLabel: string | null
  /** C2: the request purpose of the turn, when the assistant step recorded one. */
  readonly purposeLabel: string | null
  /** C2: "input / output tok", when BOTH token counts of the turn are known. */
  readonly tokensLabel: string | null
  /** Viewport-y center of the hovered dot, for tooltip placement. */
  readonly top: number
  /**
   * C4: how many visible dots share the hovered mark's turn — the tooltip
   * collapse action only shows when this is > 1. `null` when the mark
   * carries no turn info (never collapsible).
   */
  readonly turnMarkCount: number | null
}

/**
 * C2: structural view of one ui-trajectory request record — the fallback
 * metadata source when no `assistant-step` node answers a turn. Only `turn`
 * and the optional provider/usage fields are read.
 */
interface TrajectoryRequestLike {
  readonly turn: number
  readonly requestConfig?: { provider: string; model: string; purpose?: string }
  readonly provenance?: { provider: string; model: string }
  readonly usage?: unknown
}

/** C2: structural view of the ui-trajectory payload served from `views.get('trajectory')`. */
interface TrajectoryViewLike {
  readonly requests?: readonly TrajectoryRequestLike[]
}

/**
 * Find a chat row by its node key, avoiding CSS.escape pitfalls on keys that
 * contain `<`/`>`/`:` (the node key is `13:input-message<messageId>`).
 */
function findRow(key: string): HTMLElement | null {
  for (const row of document.querySelectorAll<HTMLElement>('[data-chat-anchor-key]')) {
    if (row.dataset.chatAnchorKey === key) return row
  }
  return null
}

/** Extract a plain-text hover preview (first 80 chars) from a ContentBlock[]. */
function extractPreview(content: unknown): string {
  return extractText(content).slice(0, PREVIEW_LENGTH)
}

/** Compact duration label (ms). */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m${s}s`
}

/** Read the ui-conversation 'turn-tail' location data (ttftMs/tokensPerSecond). */
function turnTailOf(turn: unknown): { ttftMs?: number; tokensPerSecond?: number } | undefined {
  const data = (turn as { data?: { get?: (key: string) => unknown } }).data
  if (data?.get === undefined) return undefined
  return data.get('turn-tail') as { ttftMs?: number; tokensPerSecond?: number } | undefined
}

/**
 * @param props - session standard kit (useSession, sessionId, useProjection),
 * the injected loadOlder/forkAt actions, the bookmarks store pair (useStore +
 * actions, injected by the framework from the declared store seat), and the
 * framework-synthesized `t` locale interpreter (registered via the entry's
 * `locale: 'dsh-milestone'`; defaults to a key-pass fallback for renders
 * outside the slot machinery).
 */
export function MilestoneRail({
  useSession,
  loadOlder,
  forkAt,
  useStore,
  actions,
  // P3 cross-session inject face: safe no-op defaults for renders outside
  // the slot machinery (the panel is only reachable through the toggle).
  searchSessions = async () => ({ items: [], hasMore: false }),
  openSession = () => {},
  t: frameworkT = (key) => key,
}: MilestoneRailProps) {
  const order = useSession(s => s.chat.order)
  const nodes = useSession(s => s.chat.nodes)
  const locations = useSession(s => s.chat.locations)
  const timeline = useSession(s => s.chat.timeline)
  // C2: the ui-trajectory request stream, the fallback source for the hover
  // model/purpose/token metadata. The harness merges the 'trajectory' key
  // into ConversationViewSnapshotMap (not shipped with this plugin), so the
  // view store is decoded structurally at the boundary.
  const trajectoryRequests = useSession(
    (s) => (s.views as { get(key: string): TrajectoryViewLike | undefined }).get('trajectory')?.requests,
  )
  // F3: the conversation paging window. `hasMore` is boolean (no absolute
  // count available), `loadingOlder` gates the button while a page loads.
  const hasMore = useSession(s => s.hasMore)
  const loadingOlder = useSession(s => s.loadingOlder)
  // T10: the persisted bookmark key list (toggle order). The framework's
  // useStore is a uSES-bound selector hook, so this re-renders on every
  // store mutation. Optional call: the pre-store legacy test mirror render
  // the rail without the store seat (useStore undefined) and simply read no
  // bookmarks.
  const bookmarkedKeys = useStore?.((s) => s.keys) ?? NO_BOOKMARKS

  // Ordered user-message dots. node.kind === 'user' is the append-origin human
  // prompt (steering/context/assistant/tool kinds are skipped).
  const marks = useMemo<MilestoneMark[]>(() => {
    const result: MilestoneMark[] = []
    for (const key of order) {
      const node = nodes.get(key)
      if (node === undefined || node.kind !== 'user') continue
      const data = node.data as { seq?: number; time?: number; content?: unknown }
      const turn = node.location.kind === 'turn' || node.location.kind === 'step'
        ? node.location.turn.turn
        : undefined
      result.push({
        key,
        turn,
        seq: data.seq ?? 0,
        time: data.time ?? 0,
        text: extractText(data.content),
        preview: extractPreview(data.content),
      })
    }
    return result
  }, [order, nodes])

  // F4: turn-scoped durable badge kinds ('turn-error' / 'turn-max-tokens' /
  // 'model-retry') indexed by the turn their node sits on. A cancelled
  // model-retry is dead (its turn aborted before the retry started) and
  // carries no badge.
  const kindsByTurn = useMemo<ReadonlyMap<number, readonly string[]>>(() => {
    const result = new Map<number, string[]>()
    for (const node of nodes.values()) {
      if (node.kind !== 'turn-error' && node.kind !== 'turn-max-tokens' && node.kind !== 'model-retry') continue
      if (node.kind === 'model-retry') {
        const retryState = (node.data as { retryState?: string } | undefined)?.retryState
        if (retryState === 'cancelled') continue
      }
      if (node.location.kind !== 'turn' && node.location.kind !== 'step') continue
      const kinds = result.get(node.location.turn.turn) ?? []
      kinds.push(node.kind)
      result.set(node.location.turn.turn, kinds)
    }
    return result
  }, [order, nodes])

  // F4: transient badges target only the newest mark — the session is
  // producing tokens (running) or waiting on a pending interaction
  // (awaitingInput: a non-empty `pending` snapshot).
  const running = useSession(s => s.running)
  const awaitingInput = (useSession(s => s.pending) as unknown[]).length > 0

  const [railBox, setRailBox] = useState<RailBox | null>(null)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [search, setSearch] = useState<SearchState>({ query: '', activePos: 0, panelOpen: false })
  // T10: bookmarks-only filter — when on, only bookmarked dots render.
  const [bookmarksOnly, setBookmarksOnly] = useState(false)
  // P3: focus mode — when on, a per-preference rule (buildFocusCss over the
  // persisted focus mix) dims/collapses the harness's thinking blocks
  // (`[data-variant="think"]`) and/or tool-call cards (`[data-chat-call-id]`);
  // the eye toggle arms/disarms it.
  const [focusActive, setFocusActive] = useState(false)
  // P3: the expandable all-prompts list panel — when open, the list toggle
  // arms and the fixed panel (MilestoneListPanel) lists every mark.
  const [listOpen, setListOpen] = useState(false)
  // P3 (0.6.6): while the list panel is open, the rail drains every older
  // page so the panel enumerates the WHOLE session (not just the loaded
  // window). `drainPage` marks one in-flight page fetch (drives the panel's
  // loading hint together with the remaining-page intent); `drainFailed`
  // stops the drain on a failed fetch and resets on the next open.
  const [drainPage, setDrainPage] = useState(false)
  const [drainFailed, setDrainFailed] = useState(false)
  // P3: the cross-session search panel — when open, the magnifier toggle arms
  // and the fixed panel (MilestoneSessionSearch) searches ALL sessions.
  const [crossOpen, setCrossOpen] = useState(false)
  // C3: transient copy/fork acknowledgements — the mark key whose tooltip
  // action last succeeded. Cleared when hover moves to a DIFFERENT mark
  // (buildHover is the reset — no timers).
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [forkedKey, setForkedKey] = useState<string | null>(null)
  // C4: turns whose group is collapsed to its LAST mark (per-turn collapse).
  // Updates are immutable — toggling builds a fresh ReadonlySet, never mutates.
  const [collapsedTurns, setCollapsedTurns] = useState<ReadonlySet<number>>(new Set())
  // Roving tabindex (T9): the dot index that owns the single tab stop.
  const [focusIndex, setFocusIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  // F2: the user message at/just above the conversation viewport top. Changes
  // whenever the scrollport scrolls (or the message set reorders), re-rendering
  // the dots so the current one carries the white ring.
  const currentKey = useCurrentAnchor(order)

  /**
   * P3: jump to the chat row with the given node key — smooth-scroll it into
   * view and write the position back into the URL hash (`#msg=<key>`) so
   * refresh and share preserve it. `history.replaceState` (not a
   * `location.hash` assignment) keeps the history stack clean, and it never
   * fires `hashchange`, so the deep-link listeners below never echo the
   * rail's own updates. No-op when the row is not (yet) rendered — the
   * deep-link mount retry and the load-older flow cover that case.
   */
  const jump = (key: string): void => {
    const row = findRow(key)
    if (row === null) return
    row.scrollIntoView({ behavior: 'smooth', block: 'start' })
    history.replaceState(null, '', buildMessageHash(key))
  }

  // T10: the visible dot list — the full marks list, or (filter on) the
  // bookmarked subset. EVERY downstream count (search N/M, hover N/M, roving
  // tab stop) operates on this list so the filtered view stays self-consistent.
  const displayMarks = useMemo<MilestoneMark[]>(() => {
    if (!bookmarksOnly) return marks
    return filterByBookmarks(marks, bookmarkedKeys).visible.map((i) => marks[i])
  }, [bookmarksOnly, marks, bookmarkedKeys])

  // Match list over the FULL message text. Empty query matches everything, so
  // an empty search never dims dots — `hasQuery` gates the dim styling.
  const { matches } = useMemo(
    () => filterMarks(displayMarks, search.query),
    [displayMarks, search.query],
  )
  const hasQuery = search.query.trim() !== ''
  const activeMarkIndex = hasQuery && matches.length > 0
    ? matches[Math.min(search.activePos, matches.length - 1)]
    : -1

  // C4: consecutive-turn groups over the visible dots, and the render list
  // derived from them — collapsed turns show only their LAST mark, and
  // `separatorsAt` names the item indices where a group boundary sits.
  const groups = useMemo(() => buildTurnGroups(displayMarks), [displayMarks])
  const render = useMemo(() => buildRenderList(groups, collapsedTurns), [groups, collapsedTurns])
  // B-design: the old separator LINE is gone — `separatorsAt[k]` now marks the
  // items-index where group k+1 starts; the dot at that index gets the extra
  // group gap (data-turn-gap) and carries that group's turn.
  const separatorIndices = useMemo(() => new Set(render.separatorsAt), [render])
  // C4: keys of dots rendered as a collapsed turn's summary (the turn's LAST
  // mark), mapped to that group's mark count. Mirrors buildRenderList's
  // collapse predicate: turn present, >1 marks, turn in collapsedTurns.
  const collapsedSummaries = useMemo(() => {
    const summaries = new Map<string, number>()
    for (const group of groups) {
      if (group.turn !== null && group.marks.length > 1 && collapsedTurns.has(group.turn)) {
        summaries.set(group.marks[group.marks.length - 1].key, group.marks.length)
      }
    }
    return summaries
  }, [groups, collapsedTurns])
  // C4: visible-dot count per turn — the tooltip collapse action only shows
  // for turns with more than one mark (`turnMarkCount` in the hover).
  const turnMarkCounts = useMemo(() => {
    const counts = new Map<number, number>()
    for (const mark of displayMarks) {
      if (mark.turn === undefined) continue
      counts.set(mark.turn, (counts.get(mark.turn) ?? 0) + 1)
    }
    return counts
  }, [displayMarks])

  // P3 (0.6.6): display-round labels — raw harness turn numbers renumbered
  // to a compact 1-based sequence over the marks (gaps from subagent turns
  // and repeats from multi-mark turns collapse away). Labels only:
  // grouping/collapse keep operating on the raw turn. Built over the FULL
  // marks list so the numbering is stable under the bookmarks filter.
  const displayTurns = useMemo(() => buildDisplayTurns(marks), [marks])

  // B-design personalization: the FULL toolbar prefs blob (hydrated once from
  // localStorage). Every toggle writes through to localStorage immediately, so
  // render state and the persisted blob never diverge. Backward compatible:
  // an old `{pinned}`-only blob parses with the new fields at their defaults.
  const [prefs, setPrefs] = useState<ToolbarPrefs>(() => loadPrefs())
  const { pinned, accent, iconSize, inset, side } = prefs
  // Derived metrics: the icon-size slider IS the hit area (20-36px); the dot
  // diameter and pitch scale proportionally from the classic 28/14/14 values.
  const scale = iconSize / DOT_HIT
  const hit = iconSize
  const size = DOT_SIZE * scale
  const gap = DOT_GAP * scale
  // Sourced accent tokens (always canonical after the prefs sanitizer).
  const accentSoft = lighten(accent, 0.42) ?? '#9db8ff'
  const accentBg = rgbaString(accent, 0.18) ?? 'rgba(77, 124, 254, 0.18)'
  const accentStrong = rgbaString(accent, 0.55) ?? 'rgba(77, 124, 254, 0.55)'

  /**
   * Language override (settings → 语言): `system` delegates to the harness
   * `t` seat (the framework-synthesized interpreter for the registered
   * `dsh-milestone` namespace); `zh`/`en` force the plugin's own dictionaries
   * so the rail copy switches independently of the host UI language. Every
   * call site below — rail chrome, panels, tooltip and the settings modal —
   * already resolves through this binding, so the override is global to the
   * rail without threading a second translate prop anywhere.
   */
  const t: TranslateNS<'dsh-milestone'> = prefs.locale === 'system'
    ? frameworkT
    : prefs.locale === 'en'
      ? (key, params) => translateDict(en, key, params)
      : (key, params) => translateDict(zh, key, params)

  /** Write a patch of prefs through to state + localStorage. */
  const updatePrefs = (patch: Partial<ToolbarPrefs>): void => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch }
      savePrefs(next)
      return next
    })
  }

  /** 0.6.3: patch ONE focus-mix flag/strength (nested field, same write-through). */
  const updateFocus = (patch: Partial<FocusPrefs>): void => {
    updatePrefs({ focus: { ...prefs.focus, ...patch } })
  }

  /**
   * 0.6.3: the focus block's live summary — the armed options joined into a
   * "聚焦搭配" line, plus the strength percentage. e.g. `think 淡化 · 强度 40%`.
   */
  const focusSummary = (() => {
    const parts = [
      prefs.focus.dimThink ? t('settings.focus.summary.think') : null,
      prefs.focus.dimTools ? t('settings.focus.summary.tools') : null,
      prefs.focus.collapseThink ? t('settings.focus.summary.collapse') : null,
    ].filter((part): part is string => part !== null)
    return t('settings.focus.summary', {
      opts: parts.length > 0 ? parts.join(' · ') : t('settings.focus.summary.none'),
      opacity: Math.round(prefs.focus.opacity * 100),
    })
  })()

  /** B1: flip one feature's pin — state and the persisted blob update together. */
  const onTogglePin = (id: ToolbarPinId): void => {
    setPrefs((prev) => {
      const next = togglePin(prev, id)
      savePrefs(next)
      return next
    })
  }

  /** B-design: 恢复默认 resets EVERYTHING — pins AND personalization. */
  const onResetAll = (): void => {
    const next = { ...DEFAULT_PREFS }
    setPrefs(next)
    savePrefs(next)
  }

  // B1 collapsible toolbar: the function-key area folds to an expand arrow;
  // only the user's pinned features (including a possibly-pinned settings
  // gear) stay visible while folded.
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  // Hover states for the two chrome buttons whose accent hover color cannot be
  // expressed inline (the gear/arrow `:hover` tints).
  const [expandHovered, setExpandHovered] = useState(false)
  const [settingsHovered, setSettingsHovered] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 0.6.5 first-run coach tour: open only when the mount timer fires and no
  // onboarded flag is persisted (or when the user replays it from settings).
  // `tourRun` bumps on 重新查看教程: the key change REMOUNTS the tour so the
  // replay always restarts from bubble 0 (even when the tour was already open,
  // suspended behind the settings modal).
  const [tourOpen, setTourOpen] = useState(false)
  const [tourRun, setTourRun] = useState(0)
  /** The feature whose near-row description tip is currently visible
   * (`null` = none — tips only appear on hover/focus of their own row). */
  const [descFeature, setDescFeature] = useState<ToolbarPinId | null>(null)
  /** B-design: the personalization block collapsess by default so only a
   * value summary leads the section; expanding reveals the controls. */
  const [personalOpen, setPersonalOpen] = useState(false)
  /** B-design (0.6.3): the focus block mirrors the personalization block —
   * collapsed by default, the header leads with a live option summary. */
  const [focusOpen, setFocusOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)

  // B4 update-check: the popover open flag, the last/current check result
  // (auto on mount, manual, or retry), and the floating panel's refs.
  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>(NO_UPDATE_CHECK)
  const updatePanelRef = useRef<HTMLDivElement>(null)
  const updateBtnRef = useRef<HTMLButtonElement>(null)

  /**
   * B1 settings modal: outside-pointerdown dismisses it (shared
   * useOutsideDismiss contract) with focus returning to the gear afterwards.
   * The modal's full-screen overlay wraps the dialog, so a pointerdown on the
   * backdrop (or anywhere outside the dialog) closes it; the gear's own click
   * keeps its flip semantics through a `[data-toolbar-settings]` exclusion —
   * pointerdown on an armed gear must not double-close.
   */
  useOutsideDismiss(
    settingsRef,
    settingsOpen,
    () => {
      setSettingsOpen(false)
      settingsBtnRef.current?.focus()
    },
    { exclude: (target) => outsideDismissMatches(target, '[data-toolbar-settings]') },
  )

  // B1: Escape closes the settings modal (its own keystroke owner, mirroring
  // the list/cross panels) and returns focus to the gear.
  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setSettingsOpen(false)
      settingsBtnRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  // B-design: while the modal is open, move focus INTO the dialog (the close
  // button); closing is handled by the dismiss paths, which restore focus to
  // the gear.
  useEffect(() => {
    if (!settingsOpen) return
    const closeBtn = settingsRef.current?.querySelector<HTMLElement>('[data-toolbar-settings-close]')
    closeBtn?.focus()
  }, [settingsOpen])

  /**
   * B4: run one update check. Cache-aware (`loadCachedLatest` reuses an
   * unexpired cached result without any network traffic) and never throws:
   * a network failure lands in the `failed` phase with the structured error,
   * and an unparseable `latest` (registry anomaly) is treated as "not
   * available" rather than crashing the panel.
   */
  const runUpdateCheck = (): void => {
    setUpdateCheck((prev) => ({ ...prev, phase: 'checking' }))
    void loadCachedLatest().then((result) => {
      if (result.ok) {
        let available = false
        try {
          available = needsUpdate(PLUGIN_VERSION, result.latest)
        } catch {
          available = false
        }
        setUpdateCheck({ phase: 'ok', latest: result.latest, source: result.source, error: null, available })
      } else {
        setUpdateCheck((prev) => ({ ...prev, phase: 'failed', error: result.error }))
      }
    })
  }

  // B4: one SILENT mount-time check, delayed ~1.5s so the harness settles
  // before the registry is hit. Runs whenever the rail mounts (independent of
  // toolbar visibility — the badge must work for a pinned button too) and is
  // cancelled on unmount, so a stale timer never fires into a dead component.
  useEffect(() => {
    const timer = window.setTimeout(runUpdateCheck, UPDATE_CHECK_MOUNT_DELAY)
    return () => window.clearTimeout(timer)
    // runUpdateCheck closes over only module constants + stable state
    // setters, so the first-render instance is safe to capture once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 0.6.5 first-run coach tour: ~800ms after the rail mounts, if the user has
  // never completed/skipped it, open the tour. The flag is read at FIRE time
  // (not mount time) so a replay-from-settings that completes before the delay
  // never double-pops; cancelled on unmount so a stale timer never fires into
  // a dead session. The tour itself only RENDERS inside the rail's returned
  // tree, so sessions under the rail's minimum mark count (see the early
  // return) simply never show it.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!readOnboardedFlag()) setTourOpen(true)
    }, ONBOARDING_MOUNT_DELAY)
    return () => window.clearTimeout(timer)
  }, [])

  // B4: outside-pointerdown dismisses the update popover (shared
  // useOutsideDismiss contract) with focus returning to the toggle; the
  // button's own click keeps its flip semantics via the `[data-update-check]`
  // exclusion — same pattern as the settings gear.
  useOutsideDismiss(
    updatePanelRef,
    updateOpen,
    () => {
      setUpdateOpen(false)
      updateBtnRef.current?.focus()
    },
    { exclude: (target) => outsideDismissMatches(target, '[data-update-check]') },
  )

  // B4: Escape closes the update popover and returns focus to its toggle.
  useEffect(() => {
    if (!updateOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setUpdateOpen(false)
      updateBtnRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [updateOpen])

  // P3 deep links: a `#msg=<mark key>` URL hash restores the conversation
  // position on load (and `jump` writes it back, so refresh/share preserve
  // it). The retry cycle is bounded — poll up to DEEP_LINK_MAX_POLLS × 150ms
  // for the DOM row, fetch one older page via `loadOlder` (the target may
  // predate the loaded window), poll a bounded second phase, then give up
  // silently — and cancelled on unmount, so a stale link never loops or
  // spams loadOlder.
  const marksRef = useRef(marks)
  useEffect(() => {
    marksRef.current = marks
  })

  useEffect(() => {
    const key = parseDeepLinkHash(window.location.hash)
    if (key === null) return
    let cancelled = false
    let timer: number | undefined
    const attempt = (pollsLeft: number, canLoadOlder: boolean): void => {
      if (cancelled) return
      if (findRow(key) !== null) {
        jump(key)
        return
      }
      // The session settled without this mark — the link is stale for this
      // session; give up silently. Empty marks mean the session is still
      // loading, so those keep polling.
      if (marksRef.current.length > 0 && !marksRef.current.some((m) => m.key === key)) return
      if (pollsLeft > 0) {
        timer = window.setTimeout(() => attempt(pollsLeft - 1, canLoadOlder), DEEP_LINK_POLL_DELAY)
        return
      }
      if (canLoadOlder) {
        // The row may predate the loaded window — fetch one older page, then
        // run the bounded second phase. A failed fetch also gives up silently.
        void loadOlder().then(
          () => {
            timer = window.setTimeout(() => attempt(DEEP_LINK_MAX_RETRY_POLLS, false), DEEP_LINK_POLL_DELAY)
          },
          () => {},
        )
        return
      }
      // Bounded retries exhausted — give up silently (the dots / list panel
      // still reach the mark once its page is loaded).
    }
    // Deferred start: the harness scrolls the conversation to the bottom on
    // load, so the deep link must land after the view mounts.
    timer = window.setTimeout(() => attempt(DEEP_LINK_MAX_POLLS, true), DEEP_LINK_INITIAL_DELAY)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    // P3: manual URL edits (typed hash, back/forward): jump when the target
    // is a known mark. `jump` writes via replaceState, which never fires
    // hashchange, so this listener never echoes the rail's own updates.
    const onHashChange = (): void => {
      const key = parseDeepLinkHash(window.location.hash)
      if (key === null) return
      if (marksRef.current.some((m) => m.key === key)) jump(key)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  // Position the rail at the conversation scrollport's chosen edge (settings
  // side). Depends on mark count + inset (the edge offset), not mark content,
  // so it re-runs on length/inset changes, not on every message update.
  useLayoutEffect(() => {
    if (marks.length < MIN_MARKS) {
      setRailBox(null)
      return
    }
    const scrollport = document.querySelector<HTMLElement>('[data-conversation-scroll]')
    if (scrollport === null) return
    const compute = (): void => {
      const sp = scrollport.getBoundingClientRect()
      setRailBox({
        top: sp.top,
        height: sp.height,
        right: Math.max(0, window.innerWidth - sp.right + inset),
        left: Math.max(0, sp.left + inset),
      })
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(scrollport)
    window.addEventListener('resize', compute)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', compute)
    }
  }, [marks.length, inset])

  // Keep the roving tab stop inside the dot list when it shrinks (the
  // bookmarks-only filter or a collapsed turn narrows the dots): an
  // out-of-range focusIndex would leave the widget with NO tab stop at all.
  useLayoutEffect(() => {
    setFocusIndex((f) => clampIndex(f, render.items.length))
  }, [render.items.length])

  // F4: the transient pulsing badge (running/awaiting) can only wear the
  // NEWEST displayed mark, so its glow color is computable up front; the rail
  // injects the breathing-glow keyframes for exactly that color while it is
  // on screen (the badge span references the `milestone-badge-pulse` name).
  const lastBadge = useMemo<BadgeKind | null>(() => {
    if (displayMarks.length === 0) return null
    const last = displayMarks[displayMarks.length - 1]
    const kinds = last.turn === undefined ? NO_KINDS : kindsByTurn.get(last.turn) ?? NO_KINDS
    return deriveBadge({ nodeKinds: kinds, lastMark: true, running, awaitingInput })
  }, [displayMarks, kindsByTurn, running, awaitingInput])
  const pulseCss = useMemo(() => {
    if (lastBadge === null) return null
    const style = badgeRingStyle(lastBadge)
    return style.pulse ? badgePulseCss(style.color) : null
  }, [lastBadge])

  // P3: Escape closes the floating panels (list + cross-session search) no
  // matter where focus sits — they are fixed floating layers, so the window
  // owns the dismiss keystroke.
  useEffect(() => {
    if (!listOpen && !crossOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      setListOpen(false)
      setCrossOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [listOpen, crossOpen])

  // P3 (0.6.6): drain every older page while the list panel is open, so the
  // all-prompts list covers the WHOLE session — it is the "find anything"
  // affordance and must not stop at the loaded window. One page per effect
  // run: each fetch resolves into a fresh commit that re-reads `hasMore`, so
  // the drain advances one page per render round-trip (no tight loop) and
  // stops on the last page, a failed fetch (retried on the NEXT open), or
  // the panel closing. Re-opening retries after a failure.
  const listDraining = listOpen && (drainPage || (hasMore && !drainFailed))
  useEffect(() => {
    if (!listOpen) return
    setDrainFailed(false)
  }, [listOpen])
  useEffect(() => {
    if (!listOpen || !hasMore || drainPage || drainFailed) return
    setDrainPage(true)
    loadOlder()
      .catch(() => setDrainFailed(true))
      .finally(() => setDrainPage(false))
  }, [listOpen, hasMore, drainPage, drainFailed, loadOlder])

  if (railBox === null || marks.length < MIN_MARKS) return null

  const updateQuery = (query: string): void => {
    setSearch({ query, activePos: 0, panelOpen: true })
  }

  const clearSearch = (): void => {
    setSearch((s) => ({ ...s, query: '', activePos: 0 }))
  }

  const closeSearch = (): void => {
    setSearch({ query: '', activePos: 0, panelOpen: false })
  }

  /** Enter: cycle to the next match (wrapping) and jump to that dot's row. */
  const advanceMatch = (): void => {
    if (matches.length === 0) return
    const next = nextMatchIndex(search.activePos, matches.length, 1)
    setSearch((s) => ({ ...s, activePos: next }))
    jump(displayMarks[matches[next]].key)
  }

  const onSearchKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') advanceMatch()
    if (e.key === 'Escape') closeSearch()
  }

  /**
   * B-design: viewport `right` offset for the floating layers. On the classic
   * right-side rail the panels sit left of the rail (their right edge at
   * railBox.right + hit + 8); on a LEFT rail every layer flips to the rail's
   * OTHER side — its left edge at railBox.left + hit + 8, which means its
   * viewport `right` must be backed out from the (known) panel width.
   */
  const panelRightFor = (panelWidth: number): number =>
    side === 'left'
      ? window.innerWidth - (railBox.left + hit + 8 + panelWidth)
      : railBox.right + hit + 8

  /** Close the settings modal via its backdrop/close button paths. */
  const closeSettings = (): void => {
    setSettingsOpen(false)
    settingsBtnRef.current?.focus()
  }

  /** 0.6.5: settings → 重新查看教程 — close settings and replay the coach
   * tour immediately (the flag may or may not be set; skipping/completing it
   * re-persists the flag anyway). The `tourRun` bump remounts the tour so the
   * replay always restarts from bubble 0. */
  const reopenTour = (): void => {
    setSettingsOpen(false)
    setTourRun((n) => n + 1)
    setTourOpen(true)
  }

  /** B1: a feature renders while the toolbar is EXPANDED or while it is pinned. */
  const featureVisible = (id: ToolbarPinId): boolean => toolbarExpanded || pinned.includes(id)

  /** Base chrome-button style: accent-defined active tint, scaled hit area. */
  const chromeButtonStyle = (active: boolean): CSSProperties => ({
    width: hit,
    height: hit,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? accentBg : 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: active ? accentSoft : '#8b96ab',
    transition: 'background 120ms ease, color 120ms ease',
  })

  /**
   * B1: the data-driven feature registry. Each entry's render is the feature's
   * rail-top chrome (data attributes / aria semantics preserved), moved
   * verbatim from the previous static button block; `search` is the whole
   * RailSearchUi (toggle + panel) so its lifecycle stays component-local in
   * the rail (search state lives in the rail and survives unmount). `settings`
   * lives LAST in the queue — the gear is a regular, default-unpinned feature;
   * the modal must stay reachable via 展开→齿轮.
   * Registry order = settings-menu order (站内搜索/全部提问/跨会话搜索/只看收藏/聚焦模式/检查更新/设置).
   *
   * EXTENSION POINT: push a new feature here (+ its id in toolbar-prefs.ts's
   * TOOLBAR_PIN_IDS and its locale keys) and pinning/settings/expand all
   * follow automatically — see the ToolbarFeatureDef doc above.
   */
  const toolbarFeatures: readonly ToolbarFeatureDef[] = [
    {
      id: 'search',
      labelKey: 'search.label',
      render: () => (
        <RailSearchUi
          panelTop={railBox.top}
          panelRight={panelRightFor(PANEL_WIDTH_SEARCH)}
          query={search.query}
          panelOpen={search.panelOpen}
          matches={matches.length}
          total={displayMarks.length}
          onToggle={() => setSearch((s) => ({ ...s, panelOpen: !s.panelOpen }))}
          onQueryChange={updateQuery}
          onSearchKeyDown={onSearchKeyDown}
          onClear={clearSearch}
          t={t}
        />
      ),
    },
    {
      id: 'list',
      labelKey: 'list.label',
      render: () => (
        <button
          type="button"
          data-list-toggle
          aria-label={listOpen ? t('list.close') : t('list.open')}
          title={listOpen ? t('list.close') : t('list.open')}
          aria-pressed={listOpen}
          onClick={() => setListOpen((v) => !v)}
          style={chromeButtonStyle(listOpen)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M3 6h18" />
            <path d="M3 12h18" />
            <path d="M3 18h18" />
          </svg>
        </button>
      ),
    },
    {
      id: 'sessionSearch',
      labelKey: 'search.cross',
      render: () => (
        <button
          type="button"
          data-session-search-toggle
          aria-label={crossOpen ? t('search.cross.close') : t('search.cross.open')}
          title={crossOpen ? t('search.cross.close') : t('search.cross.open')}
          aria-pressed={crossOpen}
          onClick={() => setCrossOpen((v) => !v)}
          style={chromeButtonStyle(crossOpen)}
        >
          {/* A list of rows with a magnifier overlaid — cross-session search. */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 6h9" />
            <path d="M3 12h9" />
            <path d="M3 18h9" />
            <circle cx="17" cy="7" r="3.5" />
            <path d="m19.5 9.5 2.5 2.5" />
          </svg>
        </button>
      ),
    },
    {
      id: 'bookmarks',
      labelKey: 'bookmark.filter',
      render: () => (
        <button
          type="button"
          data-bookmarks-toggle
          aria-label={t('bookmark.filter')}
          aria-pressed={bookmarksOnly}
          data-active={bookmarksOnly ? 'true' : undefined}
          onClick={() => setBookmarksOnly((v) => !v)}
          style={chromeButtonStyle(bookmarksOnly)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill={bookmarksOnly ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ),
    },
    {
      id: 'focus',
      labelKey: 'focus.on',
      render: () => (
        <button
          type="button"
          data-focus-toggle
          aria-label={focusActive ? t('focus.off') : t('focus.on')}
          title={focusActive ? t('focus.off') : t('focus.on')}
          aria-pressed={focusActive}
          onClick={() => setFocusActive((v) => !v)}
          style={chromeButtonStyle(focusActive)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      ),
    },
    {
      id: 'updateCheck',
      labelKey: 'update.check',
      render: () => (
        <button
          type="button"
          ref={updateBtnRef}
          data-update-check
          aria-expanded={updateOpen}
          aria-label={t('update.check')}
          title={t('update.check')}
          onClick={() => setUpdateOpen((v) => !v)}
          style={{
            position: 'relative',
            width: hit,
            height: hit,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // A pending update tints the button amber (a SEMANTIC signal, not
            // the accent) so the rail reads the availability before the
            // popover is ever opened; opening itself uses the accent tint.
            background: updateCheck.available
              ? 'rgba(245, 197, 66, 0.14)'
              : updateOpen
                ? accentBg
                : 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: updateCheck.available ? '#f5c542' : updateOpen ? accentSoft : '#8b96ab',
          }}
        >
          {/* refresh-cw: circular arrows — the update affordance. */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          {updateCheck.available && (
            <span
              data-update-available
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#f5c542',
                border: '2px solid rgba(20, 24, 32, 0.95)',
                pointerEvents: 'none',
              }}
            />
          )}
        </button>
      ),
    },
    {
      // B-design: the settings gear is the LAST registry feature (default
      // unpinned). aria-pressed mirrors the modal's open state; the render is
      // the same chrome the gear always had, moved into the registry.
      id: 'settings',
      labelKey: 'settings.label',
      render: () => (
        <button
          type="button"
          ref={settingsBtnRef}
          data-toolbar-settings
          aria-pressed={settingsOpen}
          aria-label={settingsOpen ? t('toolbar.settings.close') : t('toolbar.settings.open')}
          title={settingsOpen ? t('toolbar.settings.close') : t('toolbar.settings.open')}
          onClick={() => setSettingsOpen((v) => !v)}
          onMouseEnter={() => setSettingsHovered(true)}
          onMouseLeave={() => setSettingsHovered(false)}
          onFocus={() => setSettingsHovered(true)}
          onBlur={() => setSettingsHovered(false)}
          style={chromeButtonStyle(settingsOpen || settingsHovered)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      ),
    },
  ]

  /** Focus the dot at `index` (no-op while the list is unmounted). */
  const focusDotAt = (index: number): void => {
    listRef.current?.querySelectorAll<HTMLElement>('[data-rail-dot]')[index]?.focus()
  }

  /** Tab lands on the list itself: hand focus to the dot owning the tab stop. */
  const onListFocus = (e: ReactFocusEvent<HTMLDivElement>): void => {
    if (e.target !== e.currentTarget) return
    focusDotAt(clampIndex(focusIndex, render.items.length))
  }

  /**
   * Roving-tabindex keys: ArrowDown/ArrowUp move focus (wrapping), Home/End
   * jump to first/last. Enter/Space are deliberately NOT handled — the dots
   * are real buttons, so native activation fires the jump click untouched
   * (preventDefault here would swallow it). The rover counts RENDERED dots
   * (collapsed turns shrink the list).
   */
  const onListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    const count = render.items.length
    let next: number | null = null
    switch (e.key) {
      case 'ArrowDown': next = nextFocusIndex(focusIndex, count, 1); break
      case 'ArrowUp': next = nextFocusIndex(focusIndex, count, -1); break
      case 'Home': next = 0; break
      case 'End': next = count - 1; break
      default: return
    }
    e.preventDefault()
    const target = clampIndex(next, count)
    setFocusIndex(target)
    focusDotAt(target)
  }

  const buildHover = (mark: MilestoneMark, index: number): Omit<HoverInfo, 'top'> => {
    // C3: hovering a DIFFERENT mark clears the transient copy/fork
    // acknowledgements — the hover change itself is the reset (no timers).
    if (copiedKey !== null && mark.key !== copiedKey) setCopiedKey(null)
    if (forkedKey !== null && mark.key !== forkedKey) setForkedKey(null)
    const turn = mark.turn !== undefined ? timeline.turns.get(mark.turn) : undefined
    let durationLabel: string | null = null
    let reasonLabel: string | null = null
    let ttftLabel: string | null = null
    let tpsLabel: string | null = null
    if (turn !== undefined) {
      if (turn.start !== undefined && turn.end !== undefined) {
        durationLabel = formatDuration(turn.end.time - turn.start.time)
      }
      if (turn.end !== undefined) {
        const reason = (turn.end.data as { reason?: { kind?: string } }).reason
        // Unknown end-reason kinds pass through `reasonKeyOf` unchanged and
        // `t` falls back to the raw kind string (label-logic's escape hatch).
        if (reason?.kind !== undefined) reasonLabel = t(reasonKeyOf(reason.kind) as MilestoneKey)
      }
      const tail = turnTailOf(turn)
      if (tail !== undefined) {
        if (tail.ttftMs !== undefined) ttftLabel = formatDuration(tail.ttftMs)
        if (tail.tokensPerSecond !== undefined) tpsLabel = `${tail.tokensPerSecond.toFixed(1)} tok/s`
      }
    }
    // C2: model / purpose / token usage for the turn, from its assistant-step
    // node(s), falling back to the trajectory request stream when no node
    // answers. All-null when the turn is absent or nothing is recorded.
    const meta = deriveTurnMeta(nodes, locations, mark.turn, trajectoryRequests)
    // C4 (0.6.6): a collapsed turn's summary dot represents a RANGE of marks
    // — its position line names the whole range (`第 a–b / m 条`) instead of
    // only the last mark's slot.
    const summaryCount = collapsedSummaries.get(mark.key)
    return {
      mark,
      index,
      total: displayMarks.length,
      posLabel:
        summaryCount !== undefined
          ? t('pos.range', { a: index - summaryCount + 2, b: index + 1, m: displayMarks.length })
          : t('pos.of', { n: index + 1, m: displayMarks.length }),
      turnLabel:
        mark.turn !== undefined ? t('turn.label', { n: displayTurns.get(mark.turn) ?? mark.turn }) : null,
      durationLabel,
      reasonLabel,
      ttftLabel,
      tpsLabel,
      modelLabel: meta.model,
      purposeLabel: meta.purpose,
      tokensLabel:
        meta.inputTokens !== null && meta.outputTokens !== null
          ? `${meta.inputTokens} / ${meta.outputTokens} tok`
          : null,
      turnMarkCount: mark.turn !== undefined ? turnMarkCounts.get(mark.turn) ?? 0 : null,
    }
  }

  /**
   * C4: collapse/expand the hovered mark's turn in the rail. The set is
   * replaced immutably (a turn toggles out when already present); collapsing
   * keeps the turn's LAST mark visible via buildRenderList.
   */
  const onToggleCollapse = (turn: number): void => {
    setCollapsedTurns((prev) => {
      const next = new Set(prev)
      if (next.has(turn)) next.delete(turn)
      else next.add(turn)
      return next
    })
  }

  /**
   * T10: flip a mark's bookmark in the persisted store. The store action is
   * the write path (the engine persists synchronously). The hover re-assert
   * forces a re-render so the star reflects the toggled state — production
   * re-renders through the framework's uSES-bound useStore; the component
   * test harness injects an unsubscribed selector, so this local re-render is
   * what syncs the DOM there. Both paths converge on the same fresh snapshot.
   */
  const onToggleBookmark = (key: string): void => {
    // Optional actions: legacy render paths without the store seat no-op.
    actions?.toggle(key)
    setHover((h) => (h === null ? h : { ...h }))
  }

  /**
   * C3: copy the hovered mark's FULL message text to the system clipboard.
   * The acknowledgement only shows when the write actually succeeded.
   */
  const onCopy = async (mark: MilestoneMark): Promise<void> => {
    const ok = await copyText(mark.text)
    if (ok) setCopiedKey(mark.key)
  }

  /**
   * C3: fork the session at the hovered mark, anchoring the cut at its event
   * seq. The acknowledgement only shows once the fork resolved.
   */
  const onFork = (mark: MilestoneMark): void => {
    void forkAt(mark.seq).then(() => setForkedKey(mark.key))
  }

  // F3: an earlier page exists and the rail is rendered (marks >= MIN_MARKS is
  // already guaranteed past the early return above; kept explicit so the
  // affordance's precondition reads as one named fact).
  const showLoadOlder = hasMore && marks.length >= MIN_MARKS

  // B-design: rail root carries both the geometry AND the personalization as
  // CSS variables + data attributes (test hooks + downstream CSS consumers).
  const railStyle = {
    position: 'fixed',
    top: railBox.top,
    ...(side === 'left' ? { left: railBox.left } : { right: railBox.right }),
    height: railBox.height,
    width: hit,
    pointerEvents: 'auto',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    // Breathing room between the rail-top control buttons and a little
    // inset from the scrollport edge so the top button isn't flush.
    gap: 6,
    paddingTop: 6,
    '--ms-accent': accent,
    '--ms-accent-soft': accentSoft,
    '--ms-accent-bg': accentBg,
    '--ms-icon': `${iconSize}px`,
    '--ms-inset': `${inset}px`,
  } as unknown as CSSProperties

  return (
    <div
      style={railStyle}
      aria-label={t('rail.label')}
      data-focus-active={focusActive ? 'true' : undefined}
      data-accent={accent}
      data-side={side}
      data-icon-size={String(iconSize)}
      data-inset={String(inset)}
    >
      {pulseCss !== null && <style>{pulseCss}</style>}
      {focusActive && <style>{buildFocusCss(prefs.focus)}</style>}
      <style>{MODAL_CSS}</style>
      {showLoadOlder && (
        <button
          type="button"
          data-load-older
          data-loading-older={loadingOlder ? 'true' : undefined}
          title={t('load.older')}
          aria-label={t('load.older')}
          disabled={loadingOlder}
          onClick={() => { void loadOlder() }}
          style={{
            width: hit,
            height: hit,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: loadingOlder ? 'default' : 'pointer',
            color: loadingOlder ? '#5a6375' : '#8b96ab',
            fontSize: 13,
            lineHeight: 1,
            letterSpacing: 1,
          }}
        >
          ···
        </button>
      )}

      {/* B1 collapsible toolbar: the function-key area. Collapsed by default —
          only the expand arrow and the user's PINNED features render; the
          settings gear is a regular feature (default unpinned) so it appears
          only when expanded or pinned. */}
      <button
        type="button"
        data-toolbar-expand
        aria-expanded={toolbarExpanded}
        aria-label={toolbarExpanded ? t('toolbar.collapse') : t('toolbar.expand')}
        title={toolbarExpanded ? t('toolbar.collapse') : t('toolbar.expand')}
        onClick={() => setToolbarExpanded((v) => !v)}
        onMouseEnter={() => setExpandHovered(true)}
        onMouseLeave={() => setExpandHovered(false)}
        onFocus={() => setExpandHovered(true)}
        onBlur={() => setExpandHovered(false)}
        style={chromeButtonStyle(expandHovered)}
      >
        {/* Collapsed: chevron-down (expand reveals the features below);
            expanded: chevron-up (collapse tucks them away). */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {toolbarExpanded ? <path d="m18 15-6-6-6 6" /> : <path d="m6 9 6 6 6-6" />}
        </svg>
      </button>

      {toolbarFeatures.map((feature) =>
        featureVisible(feature.id) ? <Fragment key={feature.id}>{feature.render()}</Fragment> : null,
      )}

      {settingsOpen && (
        <div
          data-toolbar-settings-overlay
          onClick={closeSettings}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(8, 10, 15, 0.55)',
            zIndex: 105,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            ref={settingsRef}
            data-toolbar-settings-panel
            role="dialog"
            aria-modal="true"
            aria-label={t('settings.title')}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(600px, 92vw)',
              maxHeight: '78vh',
              overflowY: 'auto',
              padding: 20,
              background: MODAL_BG,
              color: MODAL_FG,
              borderRadius: MODAL_RADIUS_PANEL,
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.55)',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                marginBottom: 18,
              }}
            >
              <div data-toolbar-settings-title style={{ fontSize: 15, fontWeight: 600, color: MODAL_FG }}>
                {t('settings.title')}
              </div>
              <button
                type="button"
                data-toolbar-settings-close
                aria-label={t('settings.close')}
                title={t('settings.close')}
                onClick={closeSettings}
                style={{
                  width: 28,
                  height: 28,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: MODAL_HINT,
                  borderRadius: MODAL_RADIUS_CONTROL,
                  lineHeight: 1,
                }}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            {/* ① 功能与快捷区 — one row per feature with the "show outside collapse"
                switch. A short hint under the title re-states what the switch
                does (product: restore the list-header explanation); hovering
                or focusing a row pops a small description tip NEXT to that
                row (aria-describedby-linked, absolutely positioned inside the
                row's own box so it never covers a neighbouring row or scrolls
                out of the panel). */}
            <div data-settings-section style={{ marginBottom: 20 }}>
              <div
                data-settings-section-title
                style={{ fontSize: 13, fontWeight: 600, color: MODAL_TITLE, marginBottom: 4 }}
              >
                {t('settings.section.features')}
              </div>
              <div
                data-settings-pin-hint
                style={{ fontSize: 12, color: MODAL_HINT, lineHeight: 1.5, marginBottom: 10 }}
              >
                {t('settings.pin.hint')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {toolbarFeatures.map((feature) => {
                  const checked = pinned.includes(feature.id)
                  const active = descFeature === feature.id
                  const tipId = `ms-settings-tip-${feature.id}`
                  return (
                    <div
                      key={feature.id}
                      data-toolbar-pin-row
                      data-row-id={feature.id}
                      style={{ position: 'relative' }}
                    >
                      <button
                        type="button"
                        role="switch"
                        data-toolbar-pin-toggle
                        data-pin-id={feature.id}
                        aria-checked={checked}
                        aria-label={t(feature.labelKey)}
                        aria-describedby={tipId}
                        onMouseEnter={() => setDescFeature(feature.id)}
                        onMouseLeave={() => setDescFeature((prev) => (prev === feature.id ? null : prev))}
                        onFocus={() => setDescFeature(feature.id)}
                        onBlur={() => setDescFeature((prev) => (prev === feature.id ? null : prev))}
                        onClick={() => onTogglePin(feature.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          width: '100%',
                          padding: '8px 10px',
                          border: 'none',
                          borderRadius: MODAL_RADIUS_CONTROL,
                          cursor: 'pointer',
                          color: MODAL_FG,
                          fontSize: 13,
                          textAlign: 'left',
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t(feature.labelKey)}
                        </span>
                        {/* Switch track + thumb; accent-colored when checked. */}
                        <span
                          aria-hidden="true"
                          style={{
                            position: 'relative',
                            width: 32,
                            height: 18,
                            flexShrink: 0,
                            borderRadius: 9,
                            background: checked ? accentStrong : 'rgba(255, 255, 255, 0.16)',
                            transition: 'background 120ms ease',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: 2,
                              left: checked ? 16 : 2,
                              width: 14,
                              height: 14,
                              borderRadius: '50%',
                              background: '#ffffff',
                              transition: 'left 120ms ease',
                            }}
                          />
                        </span>
                      </button>
                      {/* Near-row description tip: floats in the row's free
                          right band (clears the switch), vertically centred so
                          it never covers an adjacent row; fades in/out via
                          MODAL_CSS. Touch reaches it through focus. */}
                      <div
                        id={tipId}
                        role="tooltip"
                        data-settings-tip
                        data-tip-for={feature.id}
                        data-tip-visible={active ? 'true' : undefined}
                        style={{
                          position: 'absolute',
                          right: MODAL_TIP_RIGHT,
                          top: '50%',
                          maxWidth: '55%',
                          transform: `translateY(-50%) translateX(${active ? 0 : 4}px)`,
                          padding: '5px 10px',
                          borderRadius: MODAL_RADIUS_CONTROL,
                          background: MODAL_TIP_BG,
                          border: `1px solid ${MODAL_BORDER}`,
                          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
                          color: MODAL_TEXT,
                          fontSize: 12,
                          lineHeight: 1.45,
                          opacity: active ? 1 : 0,
                          visibility: active ? 'visible' : 'hidden',
                          pointerEvents: 'none',
                          zIndex: 4,
                        }}
                      >
                        {t(`settings.desc.${feature.id}` as MilestoneKey)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ② 个性化 — accent, icon/dot size, edge distance, side; every control
                writes through to toolbar-prefs immediately. All of it is
                tucked into a collapsible block (collapsed by default, product:
                stop exposing the whole panel flat): the header leads with a
                chevron + title + one live value summary, expansion reveals
                the controls. */}
            <div data-settings-section data-settings-personal style={{ marginBottom: 20 }}>
              <button
                type="button"
                data-personal-toggle
                aria-expanded={personalOpen}
                aria-label={personalOpen ? t('settings.personal.collapse') : t('settings.personal.expand')}
                title={personalOpen ? t('settings.personal.collapse') : t('settings.personal.expand')}
                onClick={() => setPersonalOpen((v) => !v)}
                style={SECTION_TOGGLE_STYLE}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    transform: personalOpen ? 'rotate(90deg)' : 'none',
                  }}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span data-settings-section-title style={{ flexShrink: 0 }}>
                  {t('settings.section.personal')}
                </span>
                <span data-settings-personal-summary style={SECTION_SUMMARY_STYLE}>
                  {t('settings.personal.summary', {
                    accent,
                    icon: iconSize,
                    side: side === 'left' ? t('settings.side.left') : t('settings.side.right'),
                  })}
                </span>
              </button>
              {personalOpen && (
                <div data-settings-personal-body style={{ padding: '10px 4px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div
                    data-settings-personal-hint
                    style={{ fontSize: 12, color: MODAL_HINT, lineHeight: 1.5, padding: '0 6px' }}
                  >
                    {t('settings.personal.hint')}
                  </div>
                  {/* Accent: preset swatches + custom color input. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: MODAL_HINT, width: 90, flexShrink: 0 }}>
                      {t('settings.accent')}
                    </span>
                    <div data-accent-swatches style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {ACCENT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          data-accent-swatch
                          data-accent={preset}
                          aria-label={preset}
                          aria-pressed={accent === preset}
                          onClick={() => updatePrefs({ accent: preset })}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            background: preset,
                            border:
                              accent === preset
                                ? '2px solid #ffffff'
                                : '2px solid rgba(255, 255, 255, 0.25)',
                            boxShadow: accent === preset ? `0 0 0 2px ${preset}` : 'none',
                            padding: 0,
                            cursor: 'pointer',
                            transition: 'border-color 120ms ease, box-shadow 120ms ease',
                          }}
                        />
                      ))}
                      <label
                        data-accent-custom
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12.5,
                          color: MODAL_TEXT,
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="color"
                          value={accent}
                          onChange={(e) => updatePrefs({ accent: e.target.value })}
                          aria-label={`${t('settings.custom')} ${t('settings.accent')}`}
                          style={{
                            width: 26,
                            height: 26,
                            padding: 0,
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                          }}
                        />
                        {t('settings.custom')}
                      </label>
                    </div>
                  </div>
                  {/* Icon/dot size slider (20-36, step 2) — scales every dot metric. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: MODAL_HINT, width: 90, flexShrink: 0 }}>
                      {t('settings.iconSize')}
                    </span>
                    <input
                      type="range"
                      data-icon-size
                      min={20}
                      max={36}
                      step={2}
                      value={iconSize}
                      onChange={(e) => updatePrefs({ iconSize: Number(e.target.value) })}
                      style={{ flex: 1, minWidth: 140, maxWidth: 260 }}
                    />
                    <span data-icon-size-value style={{ fontSize: 12.5, color: MODAL_TEXT, width: 40 }}>
                      {iconSize}px
                    </span>
                  </div>
                  {/* Edge distance slider (0-40, step 2) — replaces RAIL_INSET. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: MODAL_HINT, width: 90, flexShrink: 0 }}>
                      {t('settings.inset')}
                    </span>
                    <input
                      type="range"
                      data-inset
                      min={0}
                      max={40}
                      step={2}
                      value={inset}
                      onChange={(e) => updatePrefs({ inset: Number(e.target.value) })}
                      style={{ flex: 1, minWidth: 140, maxWidth: 260 }}
                    />
                    <span data-inset-value style={{ fontSize: 12.5, color: MODAL_TEXT, width: 40 }}>
                      {inset}px
                    </span>
                  </div>
                  {/* Rail side radio group — left flips every floating layer. */}
                  <div role="radiogroup" aria-label={t('settings.side')} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: MODAL_HINT, width: 90, flexShrink: 0 }}>
                      {t('settings.side')}
                    </span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: MODAL_FG, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="ms-rail-side"
                        data-side-radio
                        value="left"
                        checked={side === 'left'}
                        onChange={() => updatePrefs({ side: 'left' as RailSide })}
                      />
                      {t('settings.side.left')}
                    </label>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: MODAL_FG, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="ms-rail-side"
                        data-side-radio
                        value="right"
                        checked={side === 'right'}
                        onChange={() => updatePrefs({ side: 'right' as RailSide })}
                      />
                      {t('settings.side.right')}
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* ②·½ 聚焦（0.6.3）— the focus-mode "聚焦搭配": which content the
                master eye switch dims/collapses, and at what strength. Mirrors
                the personalization collapsible block (collapsed by default):
                header leads with a live option summary, expansion reveals the
                three checkboxes + the strength slider. Every control writes
                through to `prefs.focus` immediately. */}
            <div data-settings-section data-focus-settings style={{ marginBottom: 20 }}>
              <button
                type="button"
                data-focus-toggle-settings
                aria-expanded={focusOpen}
                aria-label={focusOpen ? t('settings.focus.collapse') : t('settings.focus.expand')}
                title={focusOpen ? t('settings.focus.collapse') : t('settings.focus.expand')}
                onClick={() => setFocusOpen((v) => !v)}
                style={SECTION_TOGGLE_STYLE}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    transform: focusOpen ? 'rotate(90deg)' : 'none',
                  }}
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                <span data-settings-section-title style={{ flexShrink: 0 }}>
                  {t('settings.section.focus')}
                </span>
                <span data-focus-summary style={SECTION_SUMMARY_STYLE}>
                  {focusSummary}
                </span>
              </button>
              {focusOpen && (
                <div data-settings-focus-body style={{ padding: '10px 4px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div
                    data-settings-focus-hint
                    style={{ fontSize: 12, color: MODAL_HINT, lineHeight: 1.5, padding: '0 6px' }}
                  >
                    {t('settings.focus.hint')}
                  </div>
                  {/* 淡化 think（默认开）— the classic focus rule. */}
                  <label
                    data-focus-option
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: MODAL_RADIUS_CONTROL,
                      fontSize: 13,
                      color: MODAL_FG,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      data-focus-dim-think
                      checked={prefs.focus.dimThink}
                      onChange={(e) => updateFocus({ dimThink: e.target.checked })}
                    />
                    {t('settings.focus.dimThink')}
                  </label>
                  {/* 淡化工具调用卡片（默认关）— targets the stable
                      `[data-chat-call-id]` tool-card selector (see buildFocusCss). */}
                  <label
                    data-focus-option
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: MODAL_RADIUS_CONTROL,
                      fontSize: 13,
                      color: MODAL_FG,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      data-focus-dim-tools
                      checked={prefs.focus.dimTools}
                      onChange={(e) => updateFocus({ dimTools: e.target.checked })}
                    />
                    {t('settings.focus.dimTools')}
                  </label>
                  {/* 折叠 think（默认关）— pure-CSS max-height strip, hover
                      (or opening the disclosure) restores; no JS involved. */}
                  <label
                    data-focus-option
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      borderRadius: MODAL_RADIUS_CONTROL,
                      fontSize: 13,
                      color: MODAL_FG,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      data-focus-collapse-think
                      checked={prefs.focus.collapseThink}
                      onChange={(e) => updateFocus({ collapseThink: e.target.checked })}
                    />
                    {t('settings.focus.collapseThink')}
                  </label>
                  {/* 淡化强度 slider (20%–80%, step 10) — feeds every dim rule. */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5, color: MODAL_HINT, width: 90, flexShrink: 0 }}>
                      {t('settings.focus.opacity')}
                    </span>
                    <input
                      type="range"
                      data-focus-opacity
                      min={0.2}
                      max={0.8}
                      step={0.1}
                      value={prefs.focus.opacity}
                      onChange={(e) => updateFocus({ opacity: Number(e.target.value) })}
                      style={{ flex: 1, minWidth: 140, maxWidth: 260 }}
                    />
                    <span data-focus-opacity-value style={{ fontSize: 12.5, color: MODAL_TEXT, width: 44 }}>
                      {Math.round(prefs.focus.opacity * 100)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* ③ 语言 — the rail copy follows the harness locale, or is
                forced here to the plugin's own zh/en dictionaries. */}
            <div data-settings-section data-settings-lang style={{ marginBottom: 20 }}>
              <div
                data-settings-section-title
                style={{ fontSize: 13, fontWeight: 600, color: MODAL_TITLE, marginBottom: 8 }}
              >
                {t('settings.language')}
              </div>
              <div
                role="radiogroup"
                aria-label={t('settings.language')}
                style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}
              >
                {(['system', 'zh', 'en'] as const).map((value) => (
                  <label
                    key={value}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: 13,
                      color: MODAL_FG,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="ms-rail-locale"
                      data-locale-pref
                      value={value}
                      checked={prefs.locale === value}
                      onChange={() => updatePrefs({ locale: value })}
                    />
                    {t(`settings.lang.${value}`)}
                  </label>
                ))}
              </div>
            </div>

            {/* 支持我们 — compact 2×2 card grid (whole card clickable,
                _blank+noreferrer, hover micro-lift via MODAL_CSS). */}
            <div data-toolbar-settings-footer style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: MODAL_HINT, marginBottom: 10 }}>
                {t('settings.support')}
              </div>
              <div
                data-support-grid
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: 10,
                  maxWidth: 460,
                  margin: '0 auto',
                }}
              >
                <a
                  href={PLUGIN_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  data-support-card
                  data-card="repo"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  <span>{t('settings.repo')}</span>
                </a>
                <a
                  href={PLUGIN_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  data-support-card
                  data-card="star"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                    <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                  <span>{t('settings.star')}</span>
                </a>
                <a
                  href={`${PLUGIN_REPO_URL}/issues`}
                  target="_blank"
                  rel="noreferrer"
                  data-support-card
                  data-card="issues"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 8v4" strokeLinecap="round" />
                    <circle cx="12" cy="16" r="0.5" fill="currentColor" />
                  </svg>
                  <span>{t('settings.issues')}</span>
                </a>
                <a
                  href={PLUGIN_NPM_URL}
                  target="_blank"
                  rel="noreferrer"
                  data-support-card
                  data-card="npm"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                    <path d="M2 8.5h20V15h-6v2.5h-3V15H2V8.5zm1.5 1.5v3.5H6V11.5h1.5v3.5h1.5V10h-4.5zm6 0v5h3V13h2v2h1.5v-5h-6.5z" />
                  </svg>
                  <span>{t('settings.npm')}</span>
                </a>
              </div>
            </div>

            {/* 恢复默认 + 重新查看教程 — reset pins AND personalization, or
                replay the first-run tutorial (closes settings first). */}
            <div
              data-toolbar-settings-actions
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '16px auto 2px' }}
            >
              <button
                type="button"
                data-toolbar-settings-reset
                onClick={onResetAll}
                style={{
                  padding: '7px 16px',
                  border: `1px solid ${MODAL_BORDER}`,
                  borderRadius: MODAL_RADIUS_CONTROL,
                  cursor: 'pointer',
                  color: MODAL_TEXT,
                  fontSize: 12.5,
                }}
              >
                {t('settings.reset')}
              </button>
              <button
                type="button"
                data-onboarding-reopen
                onClick={reopenTour}
                style={{
                  padding: '7px 16px',
                  border: `1px solid ${MODAL_BORDER}`,
                  borderRadius: MODAL_RADIUS_CONTROL,
                  cursor: 'pointer',
                  color: MODAL_TEXT,
                  fontSize: 12.5,
                }}
              >
                {t('tour.reopen')}
              </button>
            </div>
          </div>
        </div>
      )}

      {tourOpen && (
        <MilestoneTour
          key={tourRun}
          t={t}
          side={side}
          toolbarExpanded={toolbarExpanded}
          settingsOpen={settingsOpen}
          onSetToolbarExpanded={setToolbarExpanded}
          onClose={() => setTourOpen(false)}
        />
      )}

      {updateOpen && (
        <div
          ref={updatePanelRef}
          data-update-panel
          style={{
            position: 'fixed',
            top: railBox.top,
            right: panelRightFor(PANEL_WIDTH_STANDARD),
            // Clamp so the popover never overflows a narrow viewport.
            width: 'min(280px, calc(100vw - 48px))',
            padding: '10px 12px',
            background: 'rgba(20, 24, 32, 0.97)',
            color: '#e6e8ee',
            borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
            zIndex: 104,
          }}
        >
          <div
            data-update-title
            style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee', marginBottom: 8 }}
          >
            {t('update.title')}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, lineHeight: 1.5 }}>
            <div>
              <span style={{ color: '#8b96ab' }}>{t('update.current')}: </span>
              <span>{PLUGIN_VERSION}</span>
            </div>
            {updateCheck.phase === 'ok' && updateCheck.latest !== null && (
              <div data-update-latest>
                <span style={{ color: '#8b96ab' }}>{t('update.latest')}: </span>
                <span>{updateCheck.latest}</span>
                <span style={{ color: '#8b96ab' }}> ({updateCheck.source})</span>
              </div>
            )}
            {updateCheck.phase === 'checking' && (
              <div data-update-status style={{ color: '#8b96ab' }}>{t('update.checking')}</div>
            )}
            {updateCheck.phase === 'failed' && (
              <div data-update-failed>
                <span>{t('update.failed')}:</span>{' '}
                <span style={{ color: '#8b96ab' }}>{updateCheck.error}</span>{' '}
                <button
                  type="button"
                  data-update-retry
                  onClick={runUpdateCheck}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: accentSoft,
                    fontSize: 12,
                    textDecoration: 'underline',
                  }}
                >
                  {t('update.retry')}
                </button>
              </div>
            )}
            {updateCheck.phase === 'ok' && updateCheck.latest !== null && (
              <div data-update-conclusion>
                {updateCheck.available ? (
                  <>
                    <span>{t('update.available')} v{updateCheck.latest} → </span>
                    <a
                      href={PLUGIN_NPM_URL}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: accentSoft, textDecoration: 'none' }}
                    >
                      {t('update.goNpm')}
                    </a>
                  </>
                ) : (
                  <span style={{ color: '#7ee2a8' }}>{t('update.upToDate')}</span>
                )}
              </div>
            )}
            <div data-update-host-lines>
              <span style={{ color: '#8b96ab' }}>{t('update.hostLines')}: </span>
              <span>{SUPPORTED_HOST_LINES.map(hostLineLabel).join('、')}</span>
            </div>
            <button
              type="button"
              data-update-manual
              disabled={updateCheck.phase === 'checking'}
              onClick={runUpdateCheck}
              style={{
                marginTop: 4,
                padding: '6px 10px',
                background: updateCheck.phase === 'checking' ? 'transparent' : accentBg,
                border: 'none',
                borderRadius: 6,
                cursor: updateCheck.phase === 'checking' ? 'default' : 'pointer',
                color: updateCheck.phase === 'checking' ? '#5a6375' : accentSoft,
                fontSize: 12,
                alignSelf: 'flex-start',
              }}
            >
              {updateCheck.phase === 'checking' ? t('update.checking') : t('update.check')}
            </button>
          </div>
        </div>
      )}

      {listOpen && (
        <MilestoneListPanel
          panelTop={railBox.top}
          panelRight={panelRightFor(PANEL_WIDTH_STANDARD)}
          // P3: the panel enumerates EVERY user-prompt mark — the search and
          // bookmarks filters never narrow it.
          marks={marks}
          onJump={jump}
          // Outside-pointerdown dismisses the panel (shared useOutsideDismiss
          // contract; the toggle keeps its flip semantics via the exclusion).
          onClose={() => setListOpen(false)}
          // P3 (0.6.6): the rail drains older pages while the panel is open —
          // the hint row shows while a drain run is in flight.
          loading={listDraining}
          t={t}
        />
      )}

      {crossOpen && (
        <MilestoneSessionSearch
          panelTop={railBox.top}
          panelRight={panelRightFor(PANEL_WIDTH_STANDARD)}
          onClose={() => setCrossOpen(false)}
          searchSessions={searchSessions}
          openSession={openSession}
          t={t}
        />
      )}

      <div
        ref={listRef}
        data-rail-list
        tabIndex={0}
        aria-label={t('rail.list')}
        onFocus={onListFocus}
        onKeyDown={onListKeyDown}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap,
          padding: '6px 0',
          scrollbarWidth: 'none',
        }}
      >
        {render.items.map((item, i) => {
          // C4 (B-design): this slot opens a new turn group — the FIRST dot of
          // the new group carries the extra top gap (data-turn-gap) instead of
          // the old separator line. `item.mark.turn` is the group's turn (the
          // first, or collapsed-summary, mark of the group that starts here).
          const opensGroup = separatorIndices.has(i)
          const showGroupGap = opensGroup && i > 0
          // C4: buildTurnGroups narrows marks to {key, turn}; displayIndex is
          // the ORIGINAL flat index (buildRenderList contract), so resolving
          // the full mark (seq/time/text/preview) back through it is exact.
          const mark = displayMarks[item.displayIndex]
          // C4: the dot is a collapsed turn's summary when its key maps to a
          // collapsed group — `summaryCount` is that group's mark count.
          const summaryCount = collapsedSummaries.get(mark.key)
          // markState precedence (current > active > match > dimmed > normal):
          // F2 feeds isCurrent from useCurrentAnchor, so the dot for the row
          // at the viewport top is 'current'. While a query is active the
          // position ring stands down (search match/active states own the
          // dots — the active match keeps its aria-current); it returns when
          // the query clears. Hover styling wins over every search/position
          // state so hovering a dimmed dot still lights it. All search/current
          // signals use the mark's ORIGINAL flat index (item.displayIndex).
          const bookmarked = isBookmarked(bookmarkedKeys, mark.key)
          const dotState = markState({
            key: mark.key,
            hasQuery,
            isMatch: matches.includes(item.displayIndex),
            isActive: item.displayIndex === activeMarkIndex,
            isCurrent: !hasQuery && mark.key === currentKey,
          })
          const isHovered = hover?.mark.key === mark.key
          // B-design: hover ring and search-hit ring wear the ACCENT; the
          // active/current position rings stay white (readability) and the
          // active match adds an accent glow beneath the white core.
          const boxShadow = isHovered
            ? `0 0 0 3px ${rgbaString(accent, 0.35) ?? 'rgba(77, 124, 254, 0.35)'}`
            : dotState === 'active'
              ? `0 0 0 3px rgba(255, 255, 255, 0.9), 0 0 10px 2px ${rgbaString(accent, 0.55) ?? 'rgba(77, 124, 254, 0.55)'}`
              : dotState === 'current'
                ? '0 0 0 3px rgba(255, 255, 255, 0.75)'
                : dotState === 'match'
                  ? `0 0 0 2px ${rgbaString(accent, 0.45) ?? 'rgba(77, 124, 254, 0.45)'}`
                  : 'none'
          // F4: the mark's status badge. Durable kinds (error/max-tokens/
          // retry) come from the nodes stamped on this mark's turn; the
          // transient kinds (running/awaiting) only wear on the newest mark
          // (displayMarks, so the bookmarks filter re-anchors the target).
          // Precedence lives in badge-logic (error > max-tokens > retry >
          // running > awaiting); the badge GLOW composes with markState's
          // ring/shadow/opacity — it is a child of the dot span, so the
          // dimmed-dot opacity scales it down with the dot.
          const badge = deriveBadge({
            nodeKinds: mark.turn === undefined ? NO_KINDS : kindsByTurn.get(mark.turn) ?? NO_KINDS,
            lastMark: item.displayIndex === displayMarks.length - 1,
            running,
            awaitingInput,
          })
          const ringStyle = badge === null ? null : badgeRingStyle(badge)
          return (
            <Fragment key={mark.key}>
              <button
                type="button"
                style={{
                  width: hit,
                  height: hit,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  marginTop: showGroupGap ? GROUP_GAP_EXTRA : 0,
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setHover({ ...buildHover(mark, item.displayIndex), top: rect.top + rect.height / 2 })
                }}
                onClick={() => jump(mark.key)}
                data-rail-dot
                data-turn-gap={showGroupGap ? 'true' : undefined}
                data-turn={showGroupGap && mark.turn !== undefined ? mark.turn : undefined}
                data-collapsed-summary={summaryCount !== undefined ? 'true' : undefined}
                data-collapsed-count={summaryCount}
                tabIndex={focusIndex === i ? 0 : -1}
                onFocus={() => setFocusIndex(i)}
                aria-label={t('jump.to', { n: item.displayIndex + 1 })}
                aria-current={dotState === 'active' ? 'true' : undefined}
                data-current={dotState === 'current' ? 'true' : undefined}
                data-dimmed={dotState === 'dimmed' ? 'true' : undefined}
              >
                <span
                  style={{
                    position: 'relative',
                    width: size,
                    height: size,
                    borderRadius: '50%',
                    background: dotColor(item.displayIndex, marks.length, accent),
                    boxShadow,
                    transition: 'transform 120ms ease, opacity 120ms ease',
                    transform: `scale(${isHovered ? 1.35 : dotState === 'active' || dotState === 'current' ? 1.25 : 1})`,
                    opacity: isHovered || dotState !== 'dimmed' ? 1 : 0.22,
                  }}
                  data-bookmarked={bookmarked ? 'true' : undefined}
                >
                  {ringStyle !== null && (
                    <span
                      data-badge={badge}
                      style={{
                        position: 'absolute',
                        inset: -3,
                        borderRadius: '50%',
                        // B-design: soft glow — layered box-shadows, no border.
                        boxShadow: ringStyle.shadow,
                        color: ringStyle.color,
                        pointerEvents: 'none',
                        animation: ringStyle.pulse
                          ? 'milestone-badge-pulse 2s ease-in-out infinite'
                          : undefined,
                      }}
                    />
                  )}
                  {/* C4 (0.6.6): a collapsed turn's summary dot carries a
                      visible ×N badge — without it the dot looks identical to
                      a normal one and the hidden marks vanish silently. */}
                  {summaryCount !== undefined && (
                    <span
                      data-collapsed-badge
                      style={{
                        position: 'absolute',
                        top: -5,
                        right: -7,
                        minWidth: 15,
                        height: 15,
                        padding: '0 3px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 8,
                        background: 'rgba(20, 24, 32, 0.96)',
                        border: `1px solid ${accentSoft}`,
                        boxSizing: 'border-box',
                        color: '#e6e8ee',
                        fontSize: 9,
                        lineHeight: 1,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        pointerEvents: 'none',
                      }}
                    >
                      ×{summaryCount}
                    </span>
                  )}
                </span>
              </button>
            </Fragment>
          )
        })}
      </div>

      {hover !== null && (
        <MilestoneRailTooltip
          panelRight={panelRightFor(TOOLTIP_ANCHOR_WIDTH)}
          hover={hover}
          bookmarked={isBookmarked(bookmarkedKeys, hover.mark.key)}
          onToggleBookmark={() => onToggleBookmark(hover.mark.key)}
          onCopy={onCopy}
          onFork={onFork}
          copied={copiedKey === hover.mark.key}
          forked={forkedKey === hover.mark.key}
          // C4: the collapsed flag is read LIVE from state (not from the
          // hover snapshot) so the tooltip's collapse/expand label and
          // aria-pressed flip as soon as the turn toggles.
          turnCollapsed={hover.mark.turn !== undefined && collapsedTurns.has(hover.mark.turn)}
          onToggleCollapse={onToggleCollapse}
          // Hover stability (T10): entering the tooltip keeps hover set
          // (the dot no longer clears it on mouse-leave — the cursor must
          // cross the rail→tooltip gap); leaving the tooltip dismisses it.
          onMouseEnter={() => setHover((h) => h)}
          onMouseLeave={() => setHover(null)}
          t={t}
        />
      )}

      {showLoadOlder && (
        <div
          data-window-hint
          style={{
            position: 'absolute',
            bottom: 6,
            // Side-aware: the hint lives on the rail's FREE side, never over it.
            ...(side === 'left' ? { left: '100%', marginLeft: 8 } : { right: '100%', marginRight: 8 }),
            whiteSpace: 'nowrap',
            fontSize: 12,
            lineHeight: 1,
            color: 'rgba(139, 150, 171, 0.9)',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {t('window.hint', { n: marks.length })}
        </div>
      )}
    </div>
  )
}