import { db } from "../lib/db";
import { runs } from "../../shared/schema";
import { eq, desc, sql } from "drizzle-orm";

export type RunSummary = {
  id: string;
  createdAt: string;
  source: "UI" | "SUP" | "live_user" | string;
  userIdentifier?: string | null;
  goalSummary?: string | null;
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
    createdAt: r.created_at.toISOString(),
    source: r.source,
    userIdentifier: r.user_identifier ?? null,
    goalSummary: r.goal_summary ?? null,
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
    createdAt: r.created_at.toISOString(),
    source: r.source,
    userIdentifier: r.user_identifier ?? null,
    goalSummary: r.goal_summary ?? null,
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
    createdAt: row.created_at.toISOString(),
    source: row.source,
    userIdentifier: row.user_identifier ?? null,
    goalSummary: row.goal_summary ?? null,
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
  source: string;
  userId?: string | null;
  sessionId?: string | null;
  request: {
    inputText: string;
    toolCalls?: Array<{ name: string; args?: any }>;
  };
  response: {
    outputText: string;
    toolResultsSummary?: string | null;
  };
  status: "success" | "error" | "timeout" | "fail";
  durationMs: number;
  meta?: Record<string, any>;
};

export async function createLiveUserRun(
  payload: LiveUserRunPayload
): Promise<{ id: string; status: string }> {
  const runId = `live-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  await db.insert(runs).values({
    id: runId,
    source: "live_user",
    user_identifier: payload.userId ?? null,
    goal_summary: payload.request.inputText.substring(0, 200),
    status: payload.status,
    meta: {
      sessionId: payload.sessionId,
      requestText: payload.request.inputText,
      responseText: payload.response.outputText,
      toolCalls: payload.request.toolCalls,
      toolResultsSummary: payload.response.toolResultsSummary,
      durationMs: payload.durationMs,
      ...payload.meta,
    },
  });

  return { id: runId, status: payload.status };
}
