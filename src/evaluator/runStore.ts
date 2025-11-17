import { db } from "../lib/db";
import { runs } from "../../shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export type RunSummary = {
  id: string;
  created_at: string;
  source: "UI" | "SUP" | "live_user" | string;
  user_identifier?: string | null;
  goal_summary?: string | null;
  status: string;
  meta?: any;
};

export async function listRecentRuns(limit = 20): Promise<RunSummary[]> {
  const rows = await db
    .select()
    .from(runs)
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
  }));
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
  }));
}

export async function getRunById(id: string): Promise<RunSummary | null> {
  const row = await db.query.runs.findFirst({
    where: eq(runs.id, id),
  });

  if (!row) return null;

  return {
    id: row.id,
    created_at: row.created_at.toISOString(),
    source: row.source,
    user_identifier: row.user_identifier ?? null,
    goal_summary: row.goal_summary ?? null,
    status: row.status,
    meta: row.meta ?? undefined,
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
    const latestMeta = group.latest_output as any || {};
    const outputText = latestMeta.responseText || latestMeta.outputText || latestMeta.output || "";
    const outputSummary = outputText ? outputText.substring(0, 160) : null;

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
    };
  });
}

export async function getConversationEvents(conversationRunId: string): Promise<RunSummary[]> {
  const events = await db
    .select()
    .from(runs)
    .where(eq(runs.conversation_run_id, conversationRunId))
    .orderBy(sql`${runs.created_at} ASC`);

  return events.map((r) => ({
    id: r.id,
    created_at: r.created_at.toISOString(),
    source: r.source,
    user_identifier: r.user_identifier ?? null,
    goal_summary: r.goal_summary ?? null,
    status: r.status,
    meta: r.meta ?? undefined,
  }));
}
