import { db } from "../lib/db";
import { runs } from "../../shared/schema";
import { eq, desc, sql, or } from "drizzle-orm";
import { LEAD_FINDER_SOURCE, LeadFinderPayload } from "../types/events";
import { computeLeadQualityScore, type LeadQualityLabel } from "./leadQuality";

export type RunSummary = {
  id: string;
  created_at: string;
  source: "UI" | "SUP" | "live_user" | string;
  user_identifier?: string | null;
  goal_summary?: string | null;
  status: string;
  meta?: any;
  /** TOW-5: Lead quality score (0-100), only for Lead Finder runs */
  leadQualityScore?: number | null;
  /** TOW-5: Lead quality label (low/medium/high), only for Lead Finder runs */
  leadQualityLabel?: LeadQualityLabel | null;
};

export async function listRecentRuns(limit = 20): Promise<RunSummary[]> {
  const rows = await db
    .select()
    .from(runs)
    .orderBy(desc(runs.created_at))
    .limit(limit);

  return rows.map((r) => {
    const meta = r.meta as Record<string, unknown> | null;
    // TOW-5: Extract quality fields for Lead Finder runs
    const isLeadFinder = r.source === LEAD_FINDER_SOURCE;
    return {
      id: r.id,
      created_at: r.created_at.toISOString(),
      source: r.source,
      user_identifier: r.user_identifier ?? null,
      goal_summary: r.goal_summary ?? null,
      status: r.status,
      meta: meta ?? undefined,
      // TOW-5: Include quality fields only for Lead Finder runs
      leadQualityScore: isLeadFinder && typeof meta?.leadQualityScore === "number" 
        ? meta.leadQualityScore 
        : null,
      leadQualityLabel: isLeadFinder 
        ? (meta?.leadQualityLabel as LeadQualityLabel) ?? null 
        : null,
    };
  });
}

export async function listLiveUserRuns(limit = 20): Promise<RunSummary[]> {
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.source, "live_user"))
    .orderBy(desc(runs.created_at))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at.toISOString(),
    source: r.source,
    user_identifier: r.user_identifier ?? null,
    goal_summary: r.goal_summary ?? null,
    status: r.status,
    meta: r.meta ?? undefined,
    // TOW-5: Live user runs don't have lead quality (always null)
    leadQualityScore: null,
    leadQualityLabel: null,
  }));
}

export async function getRunById(id: string): Promise<RunSummary | null> {
  const row = await db.query.runs.findFirst({
    where: eq(runs.id, id),
  });

  if (!row) return null;

  const meta = row.meta as Record<string, unknown> | null;
  const isLeadFinder = row.source === LEAD_FINDER_SOURCE;

  return {
    id: row.id,
    created_at: row.created_at.toISOString(),
    source: row.source,
    user_identifier: row.user_identifier ?? null,
    goal_summary: row.goal_summary ?? null,
    status: row.status,
    meta: meta ?? undefined,
    // TOW-5: Include quality fields only for Lead Finder runs
    leadQualityScore: isLeadFinder && typeof meta?.leadQualityScore === "number" 
      ? meta.leadQualityScore 
      : null,
    leadQualityLabel: isLeadFinder 
      ? (meta?.leadQualityLabel as LeadQualityLabel) ?? null 
      : null,
  };
}

export async function createRun(data: {
  id: string;
  source: string;
  userIdentifier?: string;
  goalSummary?: string;
  status?: string;
  meta?: any;
}): Promise<void> {
  await db.insert(runs).values({
    id: data.id,
    source: data.source,
    user_identifier: data.userIdentifier ?? null,
    goal_summary: data.goalSummary ?? null,
    status: data.status ?? "completed",
    meta: data.meta ?? null,
  });
}

export type LiveUserRunPayload = {
  runId?: string;
  source: string;
  userId?: string | null;
  userEmail?: string | null;
  sessionId?: string | null;
  request?: {
    inputText?: string;
    toolCalls?: Array<{ name: string; args?: any }>;
  };
  response?: {
    outputText?: string;
    toolResultsSummary?: string | null;
  };
  status: "success" | "error" | "timeout" | "fail";
  goal?: string;
  startedAt?: number;
  completedAt?: number;
  durationMs: number;
  model?: string;
  mode?: string;
  meta?: Record<string, any>;
};

export async function createLiveUserRun(
  payload: LiveUserRunPayload
): Promise<{ id: string; conversationRunId: string; status: string }> {
  const conversationRunId = payload.runId || `conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const eventId = `${conversationRunId}-evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  
  const inputText = payload.request?.inputText || "";
  const outputText = payload.response?.outputText || "";
  
  // Validate and safely parse startedAt timestamp
  let createdAt: Date;
  if (payload.startedAt && 
      typeof payload.startedAt === 'number' && 
      Number.isFinite(payload.startedAt)) {
    const parsedDate = new Date(payload.startedAt);
    createdAt = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  } else {
    createdAt = new Date();
  }
  
  console.log("📥 Tower run log received", {
    eventId,
    conversationRunId,
    source: payload.source,
    createdAt: createdAt.toISOString(),
    hasInput: !!inputText,
    hasOutput: !!outputText,
    status: payload.status,
    durationMs: payload.durationMs,
  });
  
  const goalSummary = payload.goal || 
                      (inputText ? inputText.substring(0, 200) : null);
  
  await db.insert(runs).values({
    id: eventId,
    conversation_run_id: conversationRunId,
    source: payload.source ?? "live_user",
    user_identifier: payload.userId ?? payload.userEmail ?? null,
    goal_summary: goalSummary,
    status: payload.status,
    created_at: createdAt,
    meta: {
      sessionId: payload.sessionId,
      requestText: inputText || undefined,
      responseText: outputText || undefined,
      output: outputText || undefined,
      inputText: inputText || undefined,
      toolCalls: payload.request?.toolCalls,
      toolResultsSummary: payload.response?.toolResultsSummary,
      durationMs: payload.durationMs,
      startedAt: payload.startedAt,
      completedAt: payload.completedAt,
      model: payload.model,
      mode: payload.mode,
      ...payload.meta,
    },
  });

  return { id: eventId, conversationRunId, status: payload.status };
}

export interface ConversationSummary {
  conversation_run_id: string;
  first_event_time: string;
  latest_event_time: string;
  event_count: number;
  status: string;
  input_summary: string | null;
  output_summary: string | null;
  source: string;
  user_identifier: string | null;
  /** TOW-5: Lead quality score (0-100), only for Lead Finder conversations */
  leadQualityScore?: number | null;
  /** TOW-5: Lead quality label (low/medium/high), only for Lead Finder conversations */
  leadQualityLabel?: LeadQualityLabel | null;
}

export async function listConversations(limit = 50): Promise<ConversationSummary[]> {
  const conversationGroups = await db
    .select({
      conversation_run_id: runs.conversation_run_id,
      first_event_time: sql<string>`MIN(${runs.created_at})`,
      latest_event_time: sql<string>`MAX(${runs.created_at})`,
      event_count: sql<number>`COUNT(*)`,
      latest_status: sql<string>`(ARRAY_AGG(${runs.status} ORDER BY ${runs.created_at} DESC))[1]`,
      first_input: sql<string>`(ARRAY_AGG(${runs.goal_summary} ORDER BY ${runs.created_at} ASC) FILTER (WHERE ${runs.goal_summary} IS NOT NULL))[1]`,
      latest_output: sql<string>`(ARRAY_AGG(${runs.meta} ORDER BY ${runs.created_at} DESC))[1]`,
      source: sql<string>`(ARRAY_AGG(${runs.source} ORDER BY ${runs.created_at} ASC))[1]`,
      user_identifier: sql<string>`(ARRAY_AGG(${runs.user_identifier} ORDER BY ${runs.created_at} ASC) FILTER (WHERE ${runs.user_identifier} IS NOT NULL))[1]`,
    })
    .from(runs)
    .where(sql`${runs.conversation_run_id} IS NOT NULL`)
    .groupBy(runs.conversation_run_id)
    .orderBy(sql`MAX(${runs.created_at}) DESC`)
    .limit(limit);

  return conversationGroups.map((group) => {
    const latestMeta = (group.latest_output as unknown as Record<string, unknown>) || {};
    const outputText = (latestMeta.responseText || latestMeta.outputText || latestMeta.output || "") as string;
    const outputSummary = outputText ? outputText.substring(0, 160) : null;

    // TOW-5: Extract quality fields for Lead Finder sources
    const isLeadFinder = group.source === LEAD_FINDER_SOURCE;
    const leadQualityScore = isLeadFinder && typeof latestMeta.leadQualityScore === "number"
      ? latestMeta.leadQualityScore
      : null;
    const leadQualityLabel = isLeadFinder
      ? (latestMeta.leadQualityLabel as LeadQualityLabel) ?? null
      : null;

    return {
      conversation_run_id: group.conversation_run_id || "",
      first_event_time: group.first_event_time,
      latest_event_time: group.latest_event_time,
      event_count: Number(group.event_count),
      status: group.latest_status || "unknown",
      input_summary: group.first_input,
      output_summary: outputSummary,
      source: group.source || "unknown",
      user_identifier: group.user_identifier || null,
      leadQualityScore,
      leadQualityLabel,
    };
  });
}

export async function getConversationEvents(conversationRunId: string): Promise<RunSummary[]> {
  const events = await db
    .select()
    .from(runs)
    .where(eq(runs.conversation_run_id, conversationRunId))
    .orderBy(sql`${runs.created_at} ASC`);

  return events.map((r) => {
    const meta = r.meta as Record<string, unknown> | null;
    const isLeadFinder = r.source === LEAD_FINDER_SOURCE;
    return {
      id: r.id,
      created_at: r.created_at.toISOString(),
      source: r.source,
      user_identifier: r.user_identifier ?? null,
      goal_summary: r.goal_summary ?? null,
      status: r.status,
      meta: meta ?? undefined,
      // TOW-5: Include quality fields only for Lead Finder runs
      leadQualityScore: isLeadFinder && typeof meta?.leadQualityScore === "number" 
        ? meta.leadQualityScore 
        : null,
      leadQualityLabel: isLeadFinder 
        ? (meta?.leadQualityLabel as LeadQualityLabel) ?? null 
        : null,
    };
  });
}

/**
 * TOW-4: Lead Finder run payload structure
 * TOW-5: Extended with lead quality fields
 */
export type LeadFinderRunPayload = {
  /** Optional run ID for idempotency/deduplication */
  runId?: string;
  /** Correlation ID from the event system */
  correlationId: string;
  /** Session ID if available */
  sessionId?: string | null;
  /** The search query text */
  query?: string;
  /** Geographic location for the search */
  location?: string;
  /** Business vertical/industry */
  vertical?: string;
  /** Number of leads found */
  resultsCount?: number;
  /** Run status */
  status?: "completed" | "error" | "timeout";
  /** Timestamp when the search started */
  startedAt?: number;
  /** Duration of the search in milliseconds */
  durationMs?: number;
  /** Additional metadata from the event payload */
  meta?: Record<string, unknown>;
  /** TOW-5: Pre-computed lead quality score (optional, computed if not provided) */
  leadQualityScore?: number;
  /** TOW-5: Pre-computed lead quality label (optional, computed if not provided) */
  leadQualityLabel?: LeadQualityLabel;
};

/**
 * TOW-4: Creates a Lead Finder run record in the database.
 * TOW-5: Extended to compute and store lead quality score.
 * 
 * This is called when a Lead Finder event is received via the /events endpoint.
 * The run will appear in the Tower UI alongside other runs.
 * 
 * @param payload - Lead Finder run details
 * @returns The created run's ID, status, and lead quality
 */
export async function createLeadFinderRun(
  payload: LeadFinderRunPayload
): Promise<{ id: string; status: string; leadQualityScore: number; leadQualityLabel: LeadQualityLabel }> {
  // Use correlationId as the base for run ID, or generate a new one
  const runId = payload.runId || `lf-${payload.correlationId}`;
  
  // Build a summary from the search parameters
  const goalParts: string[] = [];
  if (payload.query) goalParts.push(payload.query);
  if (payload.location) goalParts.push(`in ${payload.location}`);
  if (payload.vertical) goalParts.push(`(${payload.vertical})`);
  
  const goalSummary = goalParts.length > 0 
    ? goalParts.join(" ")
    : "Lead Finder search";

  // Validate and parse timestamp
  let createdAt: Date;
  if (
    payload.startedAt &&
    typeof payload.startedAt === "number" &&
    Number.isFinite(payload.startedAt)
  ) {
    const parsedDate = new Date(payload.startedAt);
    createdAt = isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  } else {
    createdAt = new Date();
  }

  const status = payload.status ?? "completed";

  // TOW-5: Compute lead quality score (use provided values or compute from payload)
  let leadQualityScore: number;
  let leadQualityLabel: LeadQualityLabel;
  
  if (payload.leadQualityScore !== undefined && payload.leadQualityLabel !== undefined) {
    // Use pre-computed values
    leadQualityScore = payload.leadQualityScore;
    leadQualityLabel = payload.leadQualityLabel;
  } else {
    // Compute from payload
    const qualityResult = computeLeadQualityScore({
      query: payload.query,
      location: payload.location,
      vertical: payload.vertical,
      resultsCount: payload.resultsCount,
    });
    leadQualityScore = qualityResult.score;
    leadQualityLabel = qualityResult.label;
  }

  console.log("[TOW-4/5] Creating Lead Finder run", {
    runId,
    correlationId: payload.correlationId,
    goalSummary,
    status,
    resultsCount: payload.resultsCount,
    leadQualityScore,
    leadQualityLabel,
  });

  await db.insert(runs).values({
    id: runId,
    conversation_run_id: payload.sessionId || null,
    source: LEAD_FINDER_SOURCE,
    user_identifier: null, // Lead Finder searches don't have user context
    goal_summary: goalSummary,
    status,
    created_at: createdAt,
    meta: {
      correlationId: payload.correlationId,
      sessionId: payload.sessionId,
      query: payload.query,
      location: payload.location,
      vertical: payload.vertical,
      resultsCount: payload.resultsCount,
      durationMs: payload.durationMs,
      featureId: "lead_finder",
      // TOW-5: Store lead quality in meta for persistence
      leadQualityScore,
      leadQualityLabel,
      ...payload.meta,
    },
  });

  return { id: runId, status, leadQualityScore, leadQualityLabel };
}

/**
 * TOW-4: List recent Lead Finder runs
 * TOW-5: Includes lead quality score and label
 * 
 * @param limit - Maximum number of runs to return (default 20)
 * @returns Array of Lead Finder run summaries with quality fields
 */
export async function listLeadFinderRuns(limit = 20): Promise<RunSummary[]> {
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.source, LEAD_FINDER_SOURCE))
    .orderBy(desc(runs.created_at))
    .limit(limit);

  return rows.map((r) => {
    const meta = r.meta as Record<string, unknown> | null;
    return {
      id: r.id,
      created_at: r.created_at.toISOString(),
      source: r.source,
      user_identifier: r.user_identifier ?? null,
      goal_summary: r.goal_summary ?? null,
      status: r.status,
      meta: meta ?? undefined,
      // TOW-5: Extract quality fields from meta
      leadQualityScore: typeof meta?.leadQualityScore === "number" ? meta.leadQualityScore : null,
      leadQualityLabel: (meta?.leadQualityLabel as LeadQualityLabel) ?? null,
    };
  });
}
