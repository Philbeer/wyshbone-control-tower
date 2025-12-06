/**
 * TOW-7: Subconscious Run Logging
 * 
 * Logs subconscious nudge operations (list, dismiss, snooze) to the Tower runs table.
 * These runs appear in the Tower UI alongside other runs (live_user, lead_finder, etc.)
 * enabling debugging, replay, and analysis of subconscious behaviour.
 * 
 * Integration with Supervisor (SUP-13):
 * - When handling GET /api/subconscious/nudges → call logSubconsciousListNudgesRun
 * - When handling POST /api/subconscious/nudges/:id/dismiss → call logSubconsciousActionRun
 * - When handling POST /api/subconscious/nudges/:id/snooze → call logSubconsciousActionRun
 * 
 * @example
 * ```ts
 * import { 
 *   logSubconsciousListNudgesRun, 
 *   logSubconsciousActionRun 
 * } from '@wyshbone/tower/evaluator/subconsciousRunLogger';
 * 
 * // After ranking nudges in GET /api/subconscious/nudges:
 * await logSubconsciousListNudgesRun({
 *   userId: req.user?.id,
 *   accountId: req.user?.accountId,
 *   nudges: rankedNudges,
 * });
 * 
 * // After dismissing a nudge:
 * await logSubconsciousActionRun({
 *   userId: req.user?.id,
 *   nudgeId: req.params.id,
 *   action: 'dismiss',
 * });
 * ```
 */

import { db } from "../lib/db";
import { runs } from "../../shared/schema";
import { SUBCONSCIOUS_SOURCE, type SubconsciousTrigger } from "../types/events";
import type { RankedNudge, ImportanceLabel } from "./nudgeRanking";

/**
 * Context for logging a subconscious run.
 * This is the base interface used internally by all logging functions.
 * TOW-8: Includes verticalId for business vertical filtering.
 */
export interface SubconsciousRunContext {
  /** What triggered this run */
  trigger: SubconsciousTrigger;
  /** User performing the action (if authenticated) */
  userId?: string | null;
  /** Account/tenant ID (if multi-tenant) */
  accountId?: string | null;
  /** Session ID (if available from request) */
  sessionId?: string | null;
  /** Conversation run ID for grouping related runs */
  conversationId?: string | null;
  /** Total number of nudges returned/affected */
  totalNudges?: number;
  /** Count of high importance nudges */
  highImportanceCount?: number;
  /** Count of medium importance nudges */
  mediumImportanceCount?: number;
  /** Count of low importance nudges */
  lowImportanceCount?: number;
  /** Top nudges summary (compact, for display) */
  topNudges?: Array<{ 
    id: string; 
    title?: string; 
    type?: string;
    importanceScore: number; 
  }>;
  /** Specific nudge ID (for dismiss/snooze actions) */
  nudgeId?: string | null;
  /** Action performed (for dismiss/snooze) */
  action?: "dismiss" | "snooze" | null;
  /** Duration of the operation in milliseconds */
  durationMs?: number;
  /** Any additional metadata */
  meta?: Record<string, unknown>;
  /** TOW-8: Vertical/industry identifier (e.g., "brewery", "coffee") */
  verticalId?: string | null;
}

/**
 * Importance label distribution computed from nudges.
 */
export interface ImportanceDistribution {
  high: number;
  medium: number;
  low: number;
  total: number;
}

/**
 * Computes importance label distribution from ranked nudges.
 */
export function computeImportanceDistribution(nudges: RankedNudge[]): ImportanceDistribution {
  const distribution: ImportanceDistribution = { high: 0, medium: 0, low: 0, total: nudges.length };
  
  for (const nudge of nudges) {
    switch (nudge.importanceLabel) {
      case "high":
        distribution.high++;
        break;
      case "medium":
        distribution.medium++;
        break;
      case "low":
        distribution.low++;
        break;
    }
  }
  
  return distribution;
}

/**
 * Extracts a compact summary of top nudges for logging.
 * @param nudges - Ranked nudges (should already be sorted by importance)
 * @param limit - Max number of nudges to include (default 3)
 */
export function extractTopNudges(
  nudges: RankedNudge[], 
  limit = 3
): Array<{ id: string; title?: string; type?: string; importanceScore: number }> {
  return nudges.slice(0, limit).map((n) => ({
    id: n.id,
    title: n.message?.substring(0, 50) || undefined,
    type: n.type,
    importanceScore: n.importanceScore,
  }));
}

/**
 * Logs a subconscious run to the Tower runs table.
 * This is the low-level function that other helpers use.
 * TOW-8: Includes verticalId for business vertical filtering.
 * 
 * @param ctx - Subconscious run context
 */
export async function logSubconsciousRun(ctx: SubconsciousRunContext): Promise<{ id: string; verticalId: string }> {
  const runId = `subcon-${ctx.trigger}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Build goal summary based on trigger
  let goalSummary: string;
  switch (ctx.trigger) {
    case "list_nudges":
      goalSummary = ctx.totalNudges != null
        ? `List nudges (${ctx.totalNudges} total, ${ctx.highImportanceCount ?? 0} high)`
        : "List subconscious nudges";
      break;
    case "rank_nudges":
      goalSummary = ctx.totalNudges != null
        ? `Rank nudges (${ctx.totalNudges} total)`
        : "Rank subconscious nudges";
      break;
    case "dismiss_nudge":
      goalSummary = ctx.nudgeId
        ? `Dismiss nudge ${ctx.nudgeId}`
        : "Dismiss nudge";
      break;
    case "snooze_nudge":
      goalSummary = ctx.nudgeId
        ? `Snooze nudge ${ctx.nudgeId}`
        : "Snooze nudge";
      break;
    default:
      goalSummary = `Subconscious: ${ctx.trigger}`;
  }
  
  // TOW-8: Derive verticalId from context or default to "brewery"
  const verticalId = ctx.verticalId ?? "brewery";
  
  // Build metadata
  const meta: Record<string, unknown> = {
    trigger: ctx.trigger,
    totalNudges: ctx.totalNudges,
    highImportanceCount: ctx.highImportanceCount,
    mediumImportanceCount: ctx.mediumImportanceCount,
    lowImportanceCount: ctx.lowImportanceCount,
    topNudges: ctx.topNudges,
    nudgeId: ctx.nudgeId,
    action: ctx.action,
    durationMs: ctx.durationMs,
    accountId: ctx.accountId,
    ...ctx.meta,
  };
  
  // Remove undefined values for cleaner storage
  for (const key of Object.keys(meta)) {
    if (meta[key] === undefined) {
      delete meta[key];
    }
  }
  
  console.log("[TOW-7/8] Logging subconscious run", {
    runId,
    trigger: ctx.trigger,
    userId: ctx.userId,
    verticalId,
    totalNudges: ctx.totalNudges,
    highImportanceCount: ctx.highImportanceCount,
  });
  
  await db.insert(runs).values({
    id: runId,
    conversation_run_id: ctx.conversationId || ctx.sessionId || null,
    source: SUBCONSCIOUS_SOURCE,
    user_identifier: ctx.userId ?? null,
    goal_summary: goalSummary,
    status: "completed",
    // TOW-8: Store verticalId
    vertical_id: verticalId,
    meta,
  });
  
  return { id: runId, verticalId };
}

/**
 * Logs a "list nudges" operation.
 * Call this from Supervisor's GET /api/subconscious/nudges handler after ranking.
 * TOW-8: Accepts verticalId for business vertical filtering.
 * 
 * @example
 * ```ts
 * // In Supervisor GET /api/subconscious/nudges handler:
 * const rankedNudges = await rankSubconsciousNudges(rawNudges);
 * 
 * // Fire and forget - don't block the response
 * logSubconsciousListNudgesRun({
 *   userId: req.user?.id,
 *   accountId: req.user?.accountId,
 *   sessionId: req.headers['x-session-id'],
 *   verticalId: req.user?.verticalId,
 *   nudges: rankedNudges,
 * }).catch(err => console.error('[TOW-7] Failed to log subconscious run:', err));
 * 
 * return res.json(rankedNudges);
 * ```
 */
export async function logSubconsciousListNudgesRun(args: {
  userId?: string | null;
  accountId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  nudges: RankedNudge[];
  durationMs?: number;
  meta?: Record<string, unknown>;
  /** TOW-8: Vertical/industry identifier */
  verticalId?: string | null;
}): Promise<{ id: string; verticalId: string }> {
  const distribution = computeImportanceDistribution(args.nudges);
  const topNudges = extractTopNudges(args.nudges);
  
  return logSubconsciousRun({
    trigger: "list_nudges",
    userId: args.userId,
    accountId: args.accountId,
    sessionId: args.sessionId,
    conversationId: args.conversationId,
    totalNudges: distribution.total,
    highImportanceCount: distribution.high,
    mediumImportanceCount: distribution.medium,
    lowImportanceCount: distribution.low,
    topNudges,
    durationMs: args.durationMs,
    meta: args.meta,
    verticalId: args.verticalId,
  });
}

/**
 * Logs a nudge action (dismiss or snooze).
 * Call this from Supervisor's POST dismiss/snooze handlers.
 * TOW-8: Accepts verticalId for business vertical filtering.
 * 
 * @example
 * ```ts
 * // In Supervisor POST /api/subconscious/nudges/:id/dismiss handler:
 * await dismissNudge(nudgeId);
 * 
 * // Fire and forget
 * logSubconsciousActionRun({
 *   userId: req.user?.id,
 *   nudgeId: req.params.id,
 *   action: 'dismiss',
 *   importanceScore: nudge.importanceScore,
 *   verticalId: req.user?.verticalId,
 * }).catch(err => console.error('[TOW-7] Failed to log subconscious run:', err));
 * 
 * return res.json({ success: true });
 * ```
 */
export async function logSubconsciousActionRun(args: {
  userId?: string | null;
  accountId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  nudgeId: string;
  action: "dismiss" | "snooze";
  /** Optional: the nudge's importance score before action */
  importanceScore?: number;
  /** Optional: the nudge type */
  nudgeType?: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
  /** TOW-8: Vertical/industry identifier */
  verticalId?: string | null;
}): Promise<{ id: string; verticalId: string }> {
  const trigger: SubconsciousTrigger = args.action === "dismiss" 
    ? "dismiss_nudge" 
    : "snooze_nudge";
  
  return logSubconsciousRun({
    trigger,
    userId: args.userId,
    accountId: args.accountId,
    sessionId: args.sessionId,
    conversationId: args.conversationId,
    nudgeId: args.nudgeId,
    action: args.action,
    totalNudges: 1,
    durationMs: args.durationMs,
    meta: {
      importanceScore: args.importanceScore,
      nudgeType: args.nudgeType,
      ...args.meta,
    },
    verticalId: args.verticalId,
  });
}

/**
 * Logs a "rank nudges" operation.
 * This is called internally by rankSubconsciousNudges when logging is enabled.
 * Use logSubconsciousListNudgesRun for endpoint-level logging instead.
 * TOW-8: Accepts verticalId for business vertical filtering.
 */
export async function logSubconsciousRankNudgesRun(args: {
  userId?: string | null;
  accountId?: string | null;
  sessionId?: string | null;
  conversationId?: string | null;
  nudges: RankedNudge[];
  durationMs?: number;
  meta?: Record<string, unknown>;
  /** TOW-8: Vertical/industry identifier */
  verticalId?: string | null;
}): Promise<{ id: string; verticalId: string }> {
  const distribution = computeImportanceDistribution(args.nudges);
  const topNudges = extractTopNudges(args.nudges);
  
  return logSubconsciousRun({
    trigger: "rank_nudges",
    userId: args.userId,
    accountId: args.accountId,
    sessionId: args.sessionId,
    conversationId: args.conversationId,
    totalNudges: distribution.total,
    highImportanceCount: distribution.high,
    mediumImportanceCount: distribution.medium,
    lowImportanceCount: distribution.low,
    topNudges,
    durationMs: args.durationMs,
    meta: args.meta,
    verticalId: args.verticalId,
  });
}
