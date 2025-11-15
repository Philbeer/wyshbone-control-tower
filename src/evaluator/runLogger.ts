import { db } from "../lib/db";
import { behaviourTestRuns, type BehaviourTestRun } from "../../shared/schema";
import { eq, desc, and, gte } from "drizzle-orm";
import type { BehaviourTestResult } from "./behaviourTests";

export async function getLastRunForTest(testId: string): Promise<BehaviourTestRun | null> {
  const rows = await db
    .select()
    .from(behaviourTestRuns)
    .where(eq(behaviourTestRuns.testId, testId))
    .orderBy(desc(behaviourTestRuns.createdAt))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0];
  return {
    ...row,
    durationMs: row.durationMs ? parseInt(row.durationMs, 10) : null,
  };
}

export async function getRecentErrorsForTest(
  testId: string,
  withinMinutes: number = 5
): Promise<BehaviourTestRun[]> {
  const cutoffTime = new Date(Date.now() - withinMinutes * 60 * 1000);
  
  const rows = await db
    .select()
    .from(behaviourTestRuns)
    .where(
      and(
        eq(behaviourTestRuns.testId, testId),
        gte(behaviourTestRuns.createdAt, cutoffTime)
      )
    )
    .orderBy(desc(behaviourTestRuns.createdAt));

  return rows
    .filter(row => row.status === 'error' || row.status === 'fail')
    .map(row => ({
      ...row,
      durationMs: row.durationMs ? parseInt(row.durationMs, 10) : null,
    }));
}

export async function getPreviousRunForTest(
  testId: string,
  beforeRunId: string
): Promise<BehaviourTestRun | null> {
  const currentRun = await db.query.behaviourTestRuns.findFirst({
    where: eq(behaviourTestRuns.id, beforeRunId),
  });

  if (!currentRun) {
    return null;
  }

  const rows = await db
    .select()
    .from(behaviourTestRuns)
    .where(
      and(
        eq(behaviourTestRuns.testId, testId),
        // Get runs before the current one
      )
    )
    .orderBy(desc(behaviourTestRuns.createdAt))
    .limit(10);

  // Filter to runs that happened before current run
  const previousRuns = rows.filter(
    r => r.createdAt < currentRun.createdAt && r.id !== beforeRunId
  );

  if (previousRuns.length === 0) {
    return null;
  }

  const row = previousRuns[0];
  return {
    ...row,
    durationMs: row.durationMs ? parseInt(row.durationMs, 10) : null,
  };
}
