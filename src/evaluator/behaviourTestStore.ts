import { db } from "../lib/db";
import { behaviourTests, behaviourTestRuns, type BehaviourTest, type BehaviourTestRun } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";
import { getAllBehaviourTestDefinitions, type BehaviourTestResult } from "./behaviourTests";

export async function ensureBehaviourTestsSeeded(): Promise<void> {
  const definitions = getAllBehaviourTestDefinitions();
  
  for (const def of definitions) {
    await db
      .insert(behaviourTests)
      .values({
        id: def.id,
        name: def.name,
        description: def.description,
        category: def.category,
        isActive: def.isActive ? "true" : "false",
      })
      .onConflictDoUpdate({
        target: behaviourTests.id,
        set: {
          name: def.name,
          description: def.description,
          category: def.category,
          isActive: def.isActive ? "true" : "false",
        },
      });
  }
}

export async function recordBehaviourTestRun(
  result: BehaviourTestResult & { buildTag?: string }
): Promise<BehaviourTestRun> {
  const inserted = await db
    .insert(behaviourTestRuns)
    .values({
      testId: result.testId,
      status: result.status,
      details: result.details || null,
      rawLog: result.rawLog || null,
      buildTag: result.buildTag || null,
      durationMs: result.durationMs?.toString() || null,
    })
    .returning();

  const row = inserted[0];
  
  return {
    ...row,
    durationMs: row.durationMs ? parseInt(row.durationMs, 10) : null,
  };
}

export async function getRecentTestRuns(limit: number = 50): Promise<BehaviourTestRun[]> {
  const rows = await db
    .select()
    .from(behaviourTestRuns)
    .orderBy(desc(behaviourTestRuns.createdAt))
    .limit(limit);

  return rows.map(row => ({
    ...row,
    durationMs: row.durationMs ? parseInt(row.durationMs, 10) : null,
  }));
}

export async function getLatestRunByTestId(testId: string): Promise<BehaviourTestRun | null> {
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

export async function getTestRunsByTestId(testId: string, limit: number = 10): Promise<BehaviourTestRun[]> {
  const rows = await db
    .select()
    .from(behaviourTestRuns)
    .where(eq(behaviourTestRuns.testId, testId))
    .orderBy(desc(behaviourTestRuns.createdAt))
    .limit(limit);

  return rows.map(row => ({
    ...row,
    durationMs: row.durationMs ? parseInt(row.durationMs, 10) : null,
  }));
}

export async function getTestsWithLatestRuns(): Promise<
  Array<{ test: BehaviourTest; latestRun: BehaviourTestRun | null }>
> {
  const testRows = await db.select().from(behaviourTests);
  
  const results: Array<{ test: BehaviourTest; latestRun: BehaviourTestRun | null }> = [];
  
  for (const testRow of testRows) {
    const latestRun = await getLatestRunByTestId(testRow.id);
    
    results.push({
      test: {
        ...testRow,
        isActive: testRow.isActive === "true",
      },
      latestRun,
    });
  }
  
  return results;
}
