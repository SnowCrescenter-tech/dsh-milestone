/**
 * dsh-milestone node half. Registers the `milestone.messages` session
 * projection (whole-log user-message outline + per-turn metadata), which the
 * browser half consumes through `useProjection` — the 0.1.2-native channel
 * for non-chat-slot plugins to read conversation content.
 */
import type { Context } from '@deepseek-ai/cordis'
import { milestoneMessagesProjectionDefinition } from './projection/milestone-messages'

/** Cordis plugin name. */
export const name = 'milestone'

/** The projection registry is the node half's only dependency. */
export const inject = ['sessionProjections']

/**
 * Register the milestone projection unit; the registration is an effect on
 * this plugin's fiber, so unloading removes the key.
 */
export function apply(ctx: Context): void {
  ctx.sessionProjections.register(milestoneMessagesProjectionDefinition)
}