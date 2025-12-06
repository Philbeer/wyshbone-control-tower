/**
 * TOW-6: Subconscious Nudge Ranking
 * 
 * Ranks subconscious nudges by importance to help users prioritize actions.
 * This module provides pure, deterministic scoring functions that Tower
 * uses to rank nudges before they are returned to Supervisor / UI.
 * 
 * Scoring factors:
 * - Nudge type: follow_up > stale_lead > engagement > reminder > insight
 * - Recency: newer nudges score higher (exponential decay over days)
 * - Lead quality: if available, higher quality leads boost the score
 * - Status: "new" nudges get a bonus over "seen"
 * - Staleness escalation: for stale_lead type, longer staleness = higher urgency
 * 
 * Labels:
 * - score >= 70 → "high"
 * - score 40-69 → "medium"
 * - score < 40 → "low"
 */

/**
 * Nudge types ordered by inherent importance.
 * Higher base scores = more urgent action required.
 */
export type NudgeType = 
  | "follow_up"      // User should follow up with a lead
  | "stale_lead"     // Lead hasn't been contacted recently
  | "engagement"     // Engagement opportunity detected
  | "reminder"       // Generic reminder
  | "insight"        // Informational insight, lowest priority
  | string;          // Allow other types with default handling

/**
 * Possible nudge statuses.
 */
export type NudgeStatus = "new" | "seen" | "handled" | "dismissed" | "snoozed";

/**
 * Input nudge shape - matches the Supervisor/DB contract.
 * This is intentionally loose to accept what Supervisor provides.
 */
export interface SubconNudge {
  id: string;
  type: NudgeType;
  status: NudgeStatus;
  createdAt: Date | string;
  /** Optional: when the lead became stale (for stale_lead nudges) */
  staleAt?: Date | string | null;
  /** Optional: associated lead's quality score (0-100 from TOW-5) */
  leadQualityScore?: number | null;
  /** Optional: associated lead ID */
  leadId?: string | null;
  /** Optional: user-facing message */
  message?: string | null;
  /** Optional: any additional metadata */
  meta?: Record<string, unknown> | null;
}

/**
 * Output nudge with computed importance score.
 */
export interface RankedNudge extends SubconNudge {
  importanceScore: number;
  importanceLabel: ImportanceLabel;
}

/**
 * Importance label bucket for easy display.
 */
export type ImportanceLabel = "low" | "medium" | "high";

/**
 * Optional context for ranking computation.
 * Allows dependency injection for testability.
 */
export interface RankingContext {
  /** Current time - defaults to now if not provided */
  now?: Date;
  /** Custom type weights - merged with defaults */
  typeWeights?: Partial<Record<string, number>>;
}

// =====================
// Base scores by nudge type
// =====================

const DEFAULT_TYPE_WEIGHTS: Record<string, number> = {
  follow_up: 60,     // High priority: user needs to act
  stale_lead: 50,    // Important: lead may be losing interest
  engagement: 40,    // Medium: opportunity but not urgent
  reminder: 30,      // Lower: general reminders
  insight: 20,       // Lowest: informational only
};

/** Default weight for unknown nudge types */
const DEFAULT_UNKNOWN_TYPE_WEIGHT = 25;

// =====================
// Scoring constants
// =====================

/** Max recency bonus (within last 24 hours) */
const MAX_RECENCY_BONUS = 20;

/** Recency decay half-life in days */
const RECENCY_HALF_LIFE_DAYS = 3;

/** Bonus for "new" status vs "seen" */
const NEW_STATUS_BONUS = 10;

/** Max lead quality bonus */
const MAX_LEAD_QUALITY_BONUS = 15;

/** Max staleness escalation bonus (for stale_lead type) */
const MAX_STALENESS_BONUS = 10;

/** Staleness threshold in days for max bonus */
const STALENESS_MAX_DAYS = 14;

/**
 * Computes the importance score for a single nudge.
 * 
 * The scoring formula:
 * 1. Base score from nudge type (20-60)
 * 2. Recency bonus (0-20): newer = higher, exponential decay
 * 3. Status bonus (0-10): "new" nudges get a boost
 * 4. Lead quality bonus (0-15): higher quality leads get priority
 * 5. Staleness escalation (0-10): for stale_lead type, longer = more urgent
 * 
 * Total possible range: ~20-115, capped to 0-100.
 * 
 * @param nudge - The nudge to score
 * @param context - Optional ranking context (time, custom weights)
 * @returns Numeric score from 0-100
 */
export function computeNudgeScore(nudge: SubconNudge, context: RankingContext = {}): number {
  const now = context.now ?? new Date();
  const typeWeights = { ...DEFAULT_TYPE_WEIGHTS, ...context.typeWeights };
  
  // 1. Base score from type
  const baseScore = typeWeights[nudge.type] ?? DEFAULT_UNKNOWN_TYPE_WEIGHT;
  
  // 2. Recency bonus - exponential decay
  const createdAt = nudge.createdAt instanceof Date 
    ? nudge.createdAt 
    : new Date(nudge.createdAt);
  const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyBonus = MAX_RECENCY_BONUS * Math.pow(0.5, ageInDays / RECENCY_HALF_LIFE_DAYS);
  
  // 3. Status bonus - "new" nudges are more important
  const statusBonus = nudge.status === "new" ? NEW_STATUS_BONUS : 0;
  
  // 4. Lead quality bonus - scale 0-15 based on lead quality score
  let leadQualityBonus = 0;
  if (nudge.leadQualityScore != null && nudge.leadQualityScore > 0) {
    // Scale: 0-100 quality → 0-15 bonus
    leadQualityBonus = (nudge.leadQualityScore / 100) * MAX_LEAD_QUALITY_BONUS;
  }
  
  // 5. Staleness escalation - for stale_lead type, longer staleness = more urgent
  let stalenessBonus = 0;
  if (nudge.type === "stale_lead" && nudge.staleAt) {
    const staleAt = nudge.staleAt instanceof Date 
      ? nudge.staleAt 
      : new Date(nudge.staleAt);
    const staleDays = (now.getTime() - staleAt.getTime()) / (1000 * 60 * 60 * 24);
    // Linear scaling up to max
    stalenessBonus = Math.min(
      MAX_STALENESS_BONUS,
      (staleDays / STALENESS_MAX_DAYS) * MAX_STALENESS_BONUS
    );
  }
  
  // Sum and cap
  const rawScore = baseScore + recencyBonus + statusBonus + leadQualityBonus + stalenessBonus;
  return Math.min(100, Math.max(0, Math.round(rawScore)));
}

/**
 * Determines the importance label based on score.
 * 
 * @param score - Numeric score (0-100)
 * @returns Label: "high" (≥70), "medium" (40-69), "low" (<40)
 */
export function getImportanceLabel(score: number): ImportanceLabel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/**
 * Ranks a batch of nudges by computing importance scores.
 * 
 * This is the main entry point for nudge ranking. It:
 * 1. Computes scores for all nudges
 * 2. Adds importanceScore and importanceLabel to each
 * 3. Sorts by score descending, then by createdAt descending as tiebreaker
 * 
 * @param nudges - Array of nudges to rank
 * @param context - Optional ranking context
 * @returns Ranked nudges sorted by importance
 */
export function rankNudges(nudges: SubconNudge[], context: RankingContext = {}): RankedNudge[] {
  const rankedNudges = nudges.map((nudge) => {
    const importanceScore = computeNudgeScore(nudge, context);
    const importanceLabel = getImportanceLabel(importanceScore);
    return {
      ...nudge,
      importanceScore,
      importanceLabel,
    };
  });
  
  // Sort: primary by score desc, secondary by createdAt desc
  return rankedNudges.sort((a, b) => {
    if (b.importanceScore !== a.importanceScore) {
      return b.importanceScore - a.importanceScore;
    }
    // Tiebreaker: newer first
    const aTime = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
    const bTime = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
    return bTime.getTime() - aTime.getTime();
  });
}

/**
 * Returns a human-readable explanation of the scoring factors.
 * Useful for debugging/understanding why a score was assigned.
 * 
 * @param nudge - The nudge to explain
 * @param context - Optional ranking context
 * @returns Description of scoring factors
 */
export function explainNudgeScore(nudge: SubconNudge, context: RankingContext = {}): string {
  const now = context.now ?? new Date();
  const typeWeights = { ...DEFAULT_TYPE_WEIGHTS, ...context.typeWeights };
  const parts: string[] = [];
  
  // Type base
  const baseScore = typeWeights[nudge.type] ?? DEFAULT_UNKNOWN_TYPE_WEIGHT;
  parts.push(`Type "${nudge.type}": base ${baseScore}`);
  
  // Recency
  const createdAt = nudge.createdAt instanceof Date 
    ? nudge.createdAt 
    : new Date(nudge.createdAt);
  const ageInDays = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const recencyBonus = MAX_RECENCY_BONUS * Math.pow(0.5, ageInDays / RECENCY_HALF_LIFE_DAYS);
  parts.push(`Recency (${ageInDays.toFixed(1)}d old): +${recencyBonus.toFixed(1)}`);
  
  // Status
  if (nudge.status === "new") {
    parts.push(`Status "new": +${NEW_STATUS_BONUS}`);
  }
  
  // Lead quality
  if (nudge.leadQualityScore != null && nudge.leadQualityScore > 0) {
    const bonus = (nudge.leadQualityScore / 100) * MAX_LEAD_QUALITY_BONUS;
    parts.push(`Lead quality (${nudge.leadQualityScore}): +${bonus.toFixed(1)}`);
  }
  
  // Staleness
  if (nudge.type === "stale_lead" && nudge.staleAt) {
    const staleAt = nudge.staleAt instanceof Date 
      ? nudge.staleAt 
      : new Date(nudge.staleAt);
    const staleDays = (now.getTime() - staleAt.getTime()) / (1000 * 60 * 60 * 24);
    const bonus = Math.min(MAX_STALENESS_BONUS, (staleDays / STALENESS_MAX_DAYS) * MAX_STALENESS_BONUS);
    parts.push(`Staleness (${staleDays.toFixed(1)}d): +${bonus.toFixed(1)}`);
  }
  
  return parts.join("; ");
}

/**
 * Options for logging context (TOW-7).
 * Pass these to enable automatic run logging when ranking nudges.
 */
export interface SubconsciousLoggingOptions {
  /** User ID for attribution */
  userId?: string | null;
  /** Account/tenant ID */
  accountId?: string | null;
  /** Session ID for grouping */
  sessionId?: string | null;
  /** Conversation ID for grouping */
  conversationId?: string | null;
  /** Additional metadata to include in the run */
  meta?: Record<string, unknown>;
}

/**
 * Service function for Supervisor integration.
 * 
 * This is the entry point that Supervisor should call when fetching nudges.
 * It takes raw nudges from the database and returns them with importance scores.
 * 
 * TOW-7: Optionally logs the ranking operation to the Tower runs table.
 * Pass `logging` options to enable automatic run logging.
 * 
 * Usage in Supervisor's GET /api/subconscious/nudges handler:
 * ```ts
 * import { rankSubconsciousNudges } from '@wyshbone/tower/evaluator/nudgeRanking';
 * 
 * const rawNudges = await db.query.nudges.findMany({ where: ... });
 * const rankedNudges = await rankSubconsciousNudges(rawNudges, {
 *   // TOW-7: Enable logging to Tower
 *   logging: {
 *     userId: req.user?.id,
 *     accountId: req.user?.accountId,
 *     sessionId: req.headers['x-session-id'],
 *   },
 * });
 * return res.json(rankedNudges);
 * ```
 * 
 * @param rawNudges - Nudges from Supervisor/DB
 * @param options - Optional configuration
 * @returns Promise resolving to ranked nudges with importanceScore
 */
export async function rankSubconsciousNudges(
  rawNudges: SubconNudge[],
  options: {
    /** Optional: fetch lead quality scores if not present */
    fetchLeadQuality?: (leadIds: string[]) => Promise<Map<string, number>>;
    /** Optional: ranking context overrides */
    context?: RankingContext;
    /** TOW-7: Optional logging configuration. Pass to log this operation to Tower runs. */
    logging?: SubconsciousLoggingOptions;
  } = {}
): Promise<RankedNudge[]> {
  const startTime = Date.now();
  let enrichedNudges = rawNudges;
  
  // If lead quality fetcher is provided and some nudges are missing scores,
  // fetch them in batch
  if (options.fetchLeadQuality) {
    const nudgesNeedingQuality = rawNudges.filter(
      (n) => n.leadId && n.leadQualityScore == null
    );
    
    if (nudgesNeedingQuality.length > 0) {
      const leadIds = nudgesNeedingQuality
        .map((n) => n.leadId!)
        .filter((id, i, arr) => arr.indexOf(id) === i); // unique
      
      try {
        const qualityScores = await options.fetchLeadQuality(leadIds);
        enrichedNudges = rawNudges.map((nudge) => {
          if (nudge.leadId && nudge.leadQualityScore == null) {
            const score = qualityScores.get(nudge.leadId);
            if (score != null) {
              return { ...nudge, leadQualityScore: score };
            }
          }
          return nudge;
        });
      } catch (error) {
        // Log but don't fail - ranking still works without lead quality
        console.warn("[TOW-6] Failed to fetch lead quality scores:", error);
      }
    }
  }
  
  const rankedNudges = rankNudges(enrichedNudges, options.context);
  
  // TOW-7: Log the operation if logging is enabled
  if (options.logging) {
    const durationMs = Date.now() - startTime;
    
    // Import dynamically to avoid circular dependencies
    import("./subconsciousRunLogger").then(({ logSubconsciousListNudgesRun }) => {
      logSubconsciousListNudgesRun({
        userId: options.logging!.userId,
        accountId: options.logging!.accountId,
        sessionId: options.logging!.sessionId,
        conversationId: options.logging!.conversationId,
        nudges: rankedNudges,
        durationMs,
        meta: options.logging!.meta,
      }).catch((err) => {
        console.error("[TOW-7] Failed to log subconscious run:", err);
      });
    }).catch((err) => {
      console.error("[TOW-7] Failed to import subconsciousRunLogger:", err);
    });
  }
  
  return rankedNudges;
}
