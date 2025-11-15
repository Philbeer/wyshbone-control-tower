import { db } from "../lib/db";
import { runs } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";

export type RunSummary = {
  id: string;
  createdAt: string;
  source: "UI" | "SUP" | string;
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
