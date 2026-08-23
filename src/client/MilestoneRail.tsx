/**
 * MilestoneRail: the milestone.rail entry (session scope). Renders a fixed
 * right-side vertical scrubber as a **fixed-pitch dot list** (like a git commit
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
 * Positioning: the rail hugs the conversation scrollport's right edge (offset a
 * little inward so it clears the native scrollbar and sits near the prose).
 *
 * In-rail search (F1): a magnifier toggle at the rail top opens a compact
 * panel to the rail's left with a message-text search input; matches light up
 * the dots (non-matches dim), Enter cycles the active match (wrapping) and
 * jumps to it, Escape clears and closes. Matching runs over the FULL message
 * text (`text` from rail-logic.extractText), not the truncated hover preview.
 *
 * Current-position highlight (F2): the dot for the user message at/just above
 * the conversation viewport top carries a white ring (`useCurrentAnchor`
 * observes the scrollport, no polling).
 *
 * Load-older + window coverage (F3): when the session still has earlier pages
 * (`hasMore`) a slim `···` button sits at the rail top and triggers the
 * injected `loadOlder` action (disabled + `data-loading-older` while
 * `loadingOlder`), and a compact hint to the rail's left states how many
 * messages the current window covers.
 */
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { badgeRingStyle, deriveBadge } from './badge-logic'
import type { createBookmarksStore } from './bookmarkStore.ts'
import { filterByBookmarks, isBookmarked } from './bookmark-logic'
import { copyText } from './clipboard-logic'
import { buildMessageHash, parseDeepLinkHash } from './deep-link-logic'
import { reasonKeyOf } from './label-logic'
import { deriveTurnMeta } from './tooltip-logic'
import { clampIndex, nextFocusIndex } from './rail-keyboard'
import { dotColor, extractText, filterMarks, markState, nextMatchIndex } from './rail-logic'
import type { MilestoneKey } from './locales.ts'
import { buildRenderList, buildTurnGroups } from './turn-group-logic'
import { RailSearchUi } from './MilestoneRailSearch.tsx'
import { MilestoneListPanel } from './MilestoneListPanel.tsx'
import { MilestoneRailTooltip } from './MilestoneRailTooltip.tsx'
import { MilestoneSessionSearch } from './MilestoneSessionSearch.tsx'
import type { SearchSessionsFn } from './MilestoneSessionSearch.tsx'
import { useCurrentAnchor } from './useCurrentAnchor.ts'
import { outsideDismissMatches, useOutsideDismiss } from './useOutsideDismiss.ts'
import { loadPrefs, savePrefs, togglePin } from './toolbar-prefs.ts'
import type { ToolbarPinId } from './toolbar-prefs.ts'
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
/**
 * Self-contained pulse keyframes for the transient badges (running/awaiting):
 * an expanding currentColor ring on box-shadow plus an opacity beat, driven by
 * `animation` on the badge ring span (kept in an inline <style> so the plugin
 * stays zero-asset).
 */
const BADGE_PULSE_CSS = `@keyframes milestone-badge-pulse {
  0% { box-shadow: 0 0 0 0 currentColor; opacity: 0.85 }
  70% { box-shadow: 0 0 0 5px transparent; opacity: 0.35 }
  100% { box-shadow: 0 0 0 0 transparent; opacity: 0.85 }
}`
/**
 * P3 focus mode: dims the harness's AI thinking/scratchpad blocks so the
 * conversation reads cleaner. The rule targets the stable, un-hashed
 * `data-variant="think"` attribute on the thinking-block ROOT (the harness
 * renders it as `data-variant="think"` with `data-state="running|ok"`), so an
 * overlay plugin can dim it with plain CSS. Hovering a dimmed block (or
 * opening it, `[data-open]`) restores full opacity. Kept in an inline
 * <style> so the plugin stays zero-asset — same pattern as BADGE_PULSE_CSS.
 */
const FOCUS_CSS = `[data-variant="think"] { opacity: 0.4; transition: opacity 0.2s; }
[data-variant="think"]:hover, [data-variant="think"] [data-open] { opacity: 1; }`
/** Visual dot diameter (px). */
const DOT_SIZE = 14
/** Hit area per dot (px) — larger than the dot for comfortable clicking. */
const DOT_HIT = 28
/** Vertical gap between dot hit areas (px) — fixed pitch, never scaled. */
const DOT_GAP = 14
/** Inward offset from the scrollport right edge so the rail clears the scrollbar. */
const RAIL_INSET = 14
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
  readonly right: number
}

/** Hovered-dot metadata fed to the hover tooltip (MilestoneRailTooltip). */
export interface HoverInfo {
  readonly mark: MilestoneMark
  readonly index: number
  readonly total: number
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
  t = (key) => key,
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
  // store mutation. Optional call: the pre-store legacy test mirrors render
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
  // P3: focus mode — when on, a global rule dims the harness's thinking
  // blocks (`[data-variant="think"]`); the eye toggle arms/disarms it.
  const [focusActive, setFocusActive] = useState(false)
  // P3: the expandable all-prompts list panel — when open, the list toggle
  // arms and the fixed panel (MilestoneListPanel) lists every mark.
  const [listOpen, setListOpen] = useState(false)
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
  // C4: `separatorsAt[k]` is the items-index where group k+1 starts, so the
  // dot at that index carries that group's turn — the separator's data-turn.
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

  // Position the rail at the conversation scrollport's right edge. Depends only
  // on mark count (not mark content) so it re-runs on length changes, not on
  // every message update.
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
        right: Math.max(8, window.innerWidth - sp.right + RAIL_INSET),
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
  }, [marks.length])

  // Keep the roving tab stop inside the dot list when it shrinks (the
  // bookmarks-only filter or a collapsed turn narrows the dots): an
  // out-of-range focusIndex would leave the widget with NO tab stop at all.
  useLayoutEffect(() => {
    setFocusIndex((f) => clampIndex(f, render.items.length))
  }, [render.items.length])

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

  // B1 collapsible toolbar: the function-key area folds to an expand arrow +
  // settings gear; only the user's pinned features stay visible while folded.
  // `pinned` is hydrated ONCE from localStorage (sanitized by toolbar-prefs)
  // and every toggle write-throughs — the render state and the persisted blob
  // never diverge.
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pinned, setPinned] = useState<ToolbarPinId[]>(() => loadPrefs())
  const settingsRef = useRef<HTMLDivElement>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)

  // B4 update-check: the popover open flag, the last/current check result
  // (auto on mount, manual, or retry), and the floating panel's refs.
  const [updateOpen, setUpdateOpen] = useState(false)
  const [updateCheck, setUpdateCheck] = useState<UpdateCheckState>(NO_UPDATE_CHECK)
  const updatePanelRef = useRef<HTMLDivElement>(null)
  const updateBtnRef = useRef<HTMLButtonElement>(null)

  /**
   * B1 settings menu: outside-pointerdown dismisses the menu (shared
   * useOutsideDismiss contract) with focus returning to the gear afterwards.
   * The gear's own click keeps its flip semantics through a
   * `[data-toolbar-settings]` exclusion — pointerdown on an armed gear must
   * not double-close.
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

  // B1: Escape closes the settings menu (its own keystroke owner, mirroring
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

  /** B1: flip one feature's pin — state and the persisted blob update together. */
  const onTogglePin = (id: ToolbarPinId): void => {
    setPinned((prev) => {
      const next = togglePin(prev, id)
      savePrefs(next)
      return next
    })
  }

  /** B1: reset every pin (everything folds away) and persist the empty set. */
  const onResetPins = (): void => {
    setPinned([])
    savePrefs([])
  }

  /** B1: a feature renders while the toolbar is EXPANDED or while it is pinned. */
  const featureVisible = (id: ToolbarPinId): boolean => toolbarExpanded || pinned.includes(id)

  /**
   * B1: the data-driven feature registry. Each entry's render is the feature's
   * UNCHANGED rail-top chrome (data attributes / aria semantics preserved),
   * moved verbatim from the previous static button block; `search` is the
   * whole RailSearchUi (toggle + panel) so its lifecycle stays component-local
   * in the rail (search state lives in the rail and survives unmount).
   * Registry order = settings-menu order (站内搜索/全部提问/跨会话搜索/只看收藏/聚焦模式).
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
          panelRight={railBox.right + DOT_HIT + 8}
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
          style={{
            width: DOT_HIT,
            height: DOT_HIT,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: listOpen ? 'rgba(77, 124, 254, 0.18)' : 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: listOpen ? '#9db8ff' : '#8b96ab',
          }}
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
          style={{
            width: DOT_HIT,
            height: DOT_HIT,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: crossOpen ? 'rgba(77, 124, 254, 0.18)' : 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: crossOpen ? '#9db8ff' : '#8b96ab',
          }}
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
          style={{
            width: DOT_HIT,
            height: DOT_HIT,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: bookmarksOnly ? 'rgba(77, 124, 254, 0.18)' : 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: bookmarksOnly ? '#9db8ff' : '#8b96ab',
          }}
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
          style={{
            width: DOT_HIT,
            height: DOT_HIT,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: focusActive ? 'rgba(126, 226, 168, 0.14)' : 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: focusActive ? '#7ee2a8' : '#8b96ab',
          }}
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
            width: DOT_HIT,
            height: DOT_HIT,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            // A pending update tints the button amber so the rail reads the
            // availability before the popover is ever opened.
            background: updateOpen || updateCheck.available ? 'rgba(245, 197, 66, 0.14)' : 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            color: updateCheck.available ? '#f5c542' : '#8b96ab',
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
    return {
      mark,
      index,
      total: displayMarks.length,
      turnLabel: mark.turn !== undefined ? t('turn.label', { n: mark.turn }) : null,
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

  const dotPitch = DOT_HIT + DOT_GAP
  // F3: an earlier page exists and the rail is rendered (marks >= MIN_MARKS is
  // already guaranteed past the early return above; kept explicit so the
  // affordance's precondition reads as one named fact).
  const showLoadOlder = hasMore && marks.length >= MIN_MARKS

  return (
    <div
      style={{
        position: 'fixed',
        top: railBox.top,
        right: railBox.right,
        height: railBox.height,
        width: DOT_HIT,
        pointerEvents: 'auto',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        // Breathing room between the rail-top control buttons and a little
        // inset from the scrollport edge so the top button isn't flush.
        gap: 6,
        paddingTop: 6,
      }}
      aria-label={t('rail.label')}
      data-focus-active={focusActive ? 'true' : undefined}
    >
      <style>{BADGE_PULSE_CSS}</style>
      {focusActive && <style>{FOCUS_CSS}</style>}
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
            width: DOT_HIT,
            height: DOT_HIT,
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
          only the expand arrow, the settings gear, and the user's PINNED
          features render; everything else mounts only while expanded. */}
      <button
        type="button"
        data-toolbar-expand
        aria-expanded={toolbarExpanded}
        aria-label={toolbarExpanded ? t('toolbar.collapse') : t('toolbar.expand')}
        title={toolbarExpanded ? t('toolbar.collapse') : t('toolbar.expand')}
        onClick={() => setToolbarExpanded((v) => !v)}
        style={{
          width: DOT_HIT,
          height: DOT_HIT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: '#8b96ab',
        }}
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

      <button
        type="button"
        ref={settingsBtnRef}
        data-toolbar-settings
        aria-expanded={settingsOpen}
        aria-label={settingsOpen ? t('toolbar.settings.close') : t('toolbar.settings.open')}
        title={settingsOpen ? t('toolbar.settings.close') : t('toolbar.settings.open')}
        onClick={() => setSettingsOpen((v) => !v)}
        style={{
          width: DOT_HIT,
          height: DOT_HIT,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: settingsOpen ? 'rgba(77, 124, 254, 0.18)' : 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: settingsOpen ? '#9db8ff' : '#8b96ab',
        }}
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

      {toolbarFeatures.map((feature) =>
        featureVisible(feature.id) ? <Fragment key={feature.id}>{feature.render()}</Fragment> : null,
      )}

      {settingsOpen && (
        <div
          ref={settingsRef}
          data-toolbar-settings-panel
          style={{
            position: 'fixed',
            top: railBox.top,
            right: railBox.right + DOT_HIT + 8,
            // Clamp so the menu never overflows a narrow viewport.
            width: 'min(240px, calc(100vw - 48px))',
            padding: '10px 12px',
            background: 'rgba(20, 24, 32, 0.97)',
            color: '#e6e8ee',
            borderRadius: 8,
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)',
            zIndex: 104,
          }}
        >
          {/* Row hover highlight, inline like the list panel's. */}
          <style>{`[data-toolbar-pin-toggle]:hover { background: rgba(77, 124, 254, 0.18); }`}</style>
          <div
            data-toolbar-settings-title
            style={{ fontSize: 13, fontWeight: 600, color: '#e6e8ee', marginBottom: 2 }}
          >
            {t('settings.title')}
          </div>
          {/* Column caption for the pin checkboxes — the "show outside
              collapse" knob each row toggles. */}
          <div
            style={{ fontSize: 12, color: '#8b96ab', marginBottom: 4, textAlign: 'right' }}
          >
            {t('settings.pin')}
          </div>
          <div
            role="menu"
            aria-label={t('settings.title')}
            style={{ display: 'flex', flexDirection: 'column', gap: 2 }}
          >
            {toolbarFeatures.map((feature) => {
              const checked = pinned.includes(feature.id)
              return (
                <button
                  key={feature.id}
                  type="button"
                  role="menuitemcheckbox"
                  data-toolbar-pin-toggle
                  data-pin-id={feature.id}
                  aria-checked={checked}
                  onClick={() => onTogglePin(feature.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    width: '100%',
                    padding: '6px 8px',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color: '#e6e8ee',
                    fontSize: 13,
                    textAlign: 'left',
                  }}
                >
                  <span>{t(feature.labelKey)}</span>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 14,
                      height: 14,
                      flexShrink: 0,
                      borderRadius: 3,
                      border: '1px solid rgba(255, 255, 255, 0.35)',
                      background: checked ? 'rgba(77, 124, 254, 0.9)' : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontSize: 10,
                      lineHeight: 1,
                    }}
                  >
                    {checked ? '✓' : ''}
                  </span>
                </button>
              )
            })}
          </div>
          <button
            type="button"
            data-toolbar-settings-reset
            onClick={onResetPins}
            style={{
              width: '100%',
              marginTop: 6,
              padding: '6px 8px',
              background: 'transparent',
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              color: '#8b96ab',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            {t('settings.reset')}
          </button>
          <div
            data-toolbar-settings-footer
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            }}
          >
            <div style={{ fontSize: 12, color: '#8b96ab', marginBottom: 6 }}>{t('settings.support')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <a
                href={PLUGIN_REPO_URL}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: '#9db8ff', textDecoration: 'none' }}
              >
                {t('settings.repo')}
              </a>
              <a
                href={PLUGIN_REPO_URL}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: '#9db8ff', textDecoration: 'none' }}
              >
                {t('settings.star')}
              </a>
              <a
                href={`${PLUGIN_REPO_URL}/issues`}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: '#9db8ff', textDecoration: 'none' }}
              >
                {t('settings.issues')}
              </a>
              <a
                href={PLUGIN_NPM_URL}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: '#9db8ff', textDecoration: 'none' }}
              >
                {t('settings.npm')}
              </a>
            </div>
          </div>
        </div>
      )}

      {updateOpen && (
        <div
          ref={updatePanelRef}
          data-update-panel
          style={{
            position: 'fixed',
            top: railBox.top,
            right: railBox.right + DOT_HIT + 8,
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
                    color: '#9db8ff',
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
                      style={{ color: '#9db8ff', textDecoration: 'none' }}
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
                background: updateCheck.phase === 'checking' ? 'transparent' : 'rgba(77, 124, 254, 0.18)',
                border: 'none',
                borderRadius: 6,
                cursor: updateCheck.phase === 'checking' ? 'default' : 'pointer',
                color: updateCheck.phase === 'checking' ? '#5a6375' : '#9db8ff',
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
          panelRight={railBox.right + DOT_HIT + 8}
          // P3: the panel enumerates EVERY user-prompt mark — the search and
          // bookmarks filters never narrow it.
          marks={marks}
          onJump={jump}
          t={t}
        />
      )}

      {crossOpen && (
        <MilestoneSessionSearch
          panelTop={railBox.top}
          panelRight={railBox.right + DOT_HIT + 8}
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
          gap: DOT_GAP,
          padding: '6px 0',
          scrollbarWidth: 'none',
        }}
      >
        {render.items.map((item, i) => {
          // C4: this slot opens a new turn group — render a thin boundary
          // line before the dot. `item.mark.turn` is the group's turn (the
          // first, or collapsed-summary, mark of the group that starts here).
          const showSeparator = separatorIndices.has(i)
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
          const boxShadow = isHovered
            ? '0 0 0 3px rgba(77, 124, 254, 0.35)'
            : dotState === 'active'
              ? '0 0 0 3px rgba(255, 255, 255, 0.9)'
              : dotState === 'current'
                ? '0 0 0 3px rgba(255, 255, 255, 0.75)'
                : 'none'
          // F4: the mark's status badge. Durable kinds (error/max-tokens/
          // retry) come from the nodes stamped on this mark's turn; the
          // transient kinds (running/awaiting) only wear on the newest mark
          // (displayMarks, so the bookmarks filter re-anchors the target).
          // Precedence lives in badge-logic (error > max-tokens > retry >
          // running > awaiting); the badge ring COMPOSES with markState's
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
              {showSeparator && (
                <div
                  data-turn-separator
                  data-turn={mark.turn === undefined ? undefined : mark.turn}
                  style={{
                    width: DOT_HIT - 8,
                    height: 1,
                    flexShrink: 0,
                    background: 'rgba(139, 150, 171, 0.35)',
                    borderRadius: 1,
                  }}
                />
              )}
              <button
                type="button"
                style={{
                  width: DOT_HIT,
                  height: DOT_HIT,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  setHover({ ...buildHover(mark, item.displayIndex), top: rect.top + rect.height / 2 })
                }}
                onClick={() => jump(mark.key)}
                data-rail-dot
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
                    width: DOT_SIZE,
                    height: DOT_SIZE,
                    borderRadius: '50%',
                    background: dotColor(item.displayIndex, marks.length),
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
                        border: `2px solid ${ringStyle.color}`,
                        color: ringStyle.color,
                        pointerEvents: 'none',
                        animation: ringStyle.pulse
                          ? 'milestone-badge-pulse 1.4s ease-out infinite'
                          : undefined,
                      }}
                    />
                  )}
                </span>
              </button>
            </Fragment>
          )
        })}
      </div>

      {hover !== null && (
        <MilestoneRailTooltip
          panelRight={railBox.right + DOT_HIT + 8}
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
            right: '100%',
            marginRight: 8,
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
