/**
 * Pure tooltip metadata derivation for the milestone rail: given a turn, resolve
 * which model answered it, what purpose the request carried, and how many
 * tokens it consumed. All inputs are untrusted (session snapshot internals
 * typed as `unknown` at the runtime boundary), so every field is decoded
 * structurally and never throws — absent or malformed data degrades to null.
 */

/** Hover-tooltip facts for one turn; null means "unknown at the boundary". */
export interface TurnMeta {
  model: string | null
  purpose: string | null
  inputTokens: number | null
  outputTokens: number | null
}

const EMPTY_META: TurnMeta = { model: null, purpose: null, inputTokens: null, outputTokens: null }

/**
 * Structural decode of an assistant request/usage record held inside the
 * `data.finalNode` of an `assistant-step` chat node.
 */
interface FinalNodeLike {
  usage?: unknown
  provenance?: { provider: string; model: string }
  requestConfig?: { provider: string; model: string; purpose?: string }
}

/** The chat node `data` payload is `unknown`; this is the only shape we read. */
interface AssistantStepData {
  finalNode?: unknown
}

/** One entry of the trajectory list passed in as a fallback source. */
interface TrajectoryRequestLike {
  turn: number
  requestConfig?: { provider: string; model: string; purpose?: string }
  provenance?: { provider: string; model: string }
  usage?: unknown
}

/** True when the value is a plain (non-array, non-null) object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Decode a `usage` payload structurally: only numeric `inputTokens` /
 * `outputTokens` survive; anything else (absent, malformed, wrong types)
 * degrades to null — the boundary owns trust, the callers get plain numbers.
 * @param usage - untrusted usage payload (typed `unknown` at runtime).
 * @returns the token counts with null for every missing/malformed field.
 */
function decodeUsage(usage: unknown): Pick<TurnMeta, 'inputTokens' | 'outputTokens'> {
  if (!isRecord(usage)) return { inputTokens: null, outputTokens: null }
  const inputTokens = typeof usage.inputTokens === 'number' ? usage.inputTokens : null
  const outputTokens = typeof usage.outputTokens === 'number' ? usage.outputTokens : null
  return { inputTokens, outputTokens }
}

/** Resolve model/purpose from a request config, falling back to provenance. */
function metaFromRecord(record: FinalNodeLike): TurnMeta {
  return {
    model: record.requestConfig?.model ?? record.provenance?.model ?? null,
    purpose: record.requestConfig?.purpose ?? null,
    ...decodeUsage(record.usage),
  }
}

/**
 * Derive the hover metadata for one turn. Sources, in priority order:
 * 1. the `assistant-step` chat node(s) of the turn — their `data.finalNode`
 *    carries the recorded `requestConfig` / `provenance` / `usage`;
 * 2. `trajectoryRequests` — the latest entry whose `turn` matches (used when
 *    no assistant-step node yields a model or purpose);
 * 3. all-null when the turn is absent, no node matches, or everything is
 *    malformed. Never throws.
 * @param nodes - stable per-key chat node reader (as exposed by the snapshot).
 * @param locations - turn -> ordered node keys index.
 * @param turn - owning turn; undefined yields all-null.
 * @param trajectoryRequests - optional fallback request log.
 * @returns the turn's metadata, null where unknown.
 */
export function deriveTurnMeta(
  nodes: { get(key: string): { kind: string; data: unknown } | undefined },
  locations: { getTurn(turn: number): readonly string[] },
  turn: number | undefined,
  trajectoryRequests?: readonly TrajectoryRequestLike[],
): TurnMeta {
  if (turn === undefined) return EMPTY_META

  for (const key of locations.getTurn(turn)) {
    const node = nodes.get(key)
    if (node === undefined || node.kind !== 'assistant-step') continue
    // Cast only after the runtime guard: `data` is `unknown`, so it may be
    // null/primitive/array — the guard is the boundary, the cast is the decode.
    const stepData = isRecord(node.data) ? (node.data as AssistantStepData) : undefined
    const finalNode = stepData?.finalNode
    if (!isRecord(finalNode)) continue
    const meta = metaFromRecord(finalNode as FinalNodeLike)
    // Only a step that yields a model or purpose satisfies the lookup; a bare
    // usage record falls through so the trajectory fallback can still answer.
    if (meta.model !== null || meta.purpose !== null) return meta
  }

  if (trajectoryRequests !== undefined) {
    let latest: TrajectoryRequestLike | undefined
    for (const request of trajectoryRequests) {
      if (request.turn === turn) latest = request
    }
    if (latest !== undefined) return metaFromRecord(latest)
  }

  return EMPTY_META
}
