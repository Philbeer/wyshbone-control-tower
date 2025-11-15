import { db } from "../lib/db";
import { 
  investigations, 
  patchSuggestions, 
  patchEvaluations,
  behaviourTestRuns,
  type PatchSuggestion,
  type Investigation,
  type PatchEvaluation
} from "../../shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { getLastRunForTest, getRecentErrorsForTest } from "./runLogger";
import type { PatchEvaluator } from "./patchEvaluator";

export type DevBrief = {
  investigationId: string;
  createdAt: Date;
  trigger: string;
  runId: string | null;
  notes: string | null;
  diagnosis: string | null;
  runLogs: any[];
  runMeta: any;
  runContext?: {
    testId?: string;
    lastStatus?: string;
    previousStatus?: string;
    lastResponseSample?: string;
    recentErrors?: number;
    durationMs?: number;
  };
  // EVAL-008: Single-test focus for surgical patches
  focusedScope?: {
    kind: 'behaviour-test';
    testId: string;
    testName: string;
    scopeNote: string;
  };
};

export async function buildDevBrief(investigationId: string): Promise<DevBrief> {
  const inv = await db.query.investigations.findFirst({
    where: eq(investigations.id, investigationId),
  });

  if (!inv) {
    throw new Error(`Investigation ${investigationId} not found`);
  }

  const brief: DevBrief = {
    investigationId: inv.id,
    createdAt: inv.created_at,
    trigger: inv.trigger,
    runId: inv.run_id,
    notes: inv.notes,
    diagnosis: inv.diagnosis,
    runLogs: inv.run_logs || [],
    runMeta: inv.run_meta || {},
  };

  // EVAL-008: Check for single-test focus in run_meta
  const runMeta = inv.run_meta as any;
  const hasSingleTestFocus = runMeta?.focus?.kind === 'behaviour-test';
  
  if (hasSingleTestFocus) {
    const focusTestId = runMeta.focus.testId;
    const focusTestName = runMeta.focus.testName || focusTestId;
    
    brief.focusedScope = {
      kind: 'behaviour-test',
      testId: focusTestId,
      testName: focusTestName,
      scopeNote: `Scope: Single behaviour test "${focusTestName}". Your job is to fix ONLY this test and avoid changing unrelated behaviours.`,
    };
    
    // When focused on a single test, fetch ONLY that test's run context
    const focusedTestRuns = await db
      .select()
      .from(behaviourTestRuns)
      .where(eq(behaviourTestRuns.testId, focusTestId))
      .orderBy(desc(behaviourTestRuns.createdAt))
      .limit(5);
    
    if (focusedTestRuns.length > 0) {
      const testRun = focusedTestRuns[0];
      const lastRun = await getLastRunForTest(focusTestId);
      const recentErrors = await getRecentErrorsForTest(focusTestId, 5);
      const previousStatus = focusedTestRuns.length > 1 ? focusedTestRuns[1].status : undefined;

      const responseText = testRun.rawLog && typeof testRun.rawLog === 'object' && 'response' in testRun.rawLog
        ? String(testRun.rawLog.response)
        : '';

      const parsedDuration = testRun.durationMs ? parseInt(testRun.durationMs, 10) : null;
      
      brief.runContext = {
        testId: focusTestId,
        lastStatus: testRun.status,
        previousStatus,
        lastResponseSample: responseText ? responseText.substring(0, 200) : undefined,
        recentErrors: recentErrors.length,
        durationMs: parsedDuration !== null && !isNaN(parsedDuration) ? parsedDuration : undefined,
      };
    }
  } else if (inv.run_id) {
    // Legacy path: use run_id to fetch test context
    const testRuns = await db
      .select()
      .from(behaviourTestRuns)
      .where(eq(behaviourTestRuns.id, inv.run_id))
      .limit(1);

    if (testRuns.length > 0) {
      const testRun = testRuns[0];
      const testId = testRun.testId;

      const lastRun = await getLastRunForTest(testId);
      const recentErrors = await getRecentErrorsForTest(testId, 5);

      const previousRuns = await db
        .select()
        .from(behaviourTestRuns)
        .where(eq(behaviourTestRuns.testId, testId))
        .orderBy(desc(behaviourTestRuns.createdAt))
        .limit(5);

      const previousStatus = previousRuns.length > 1 ? previousRuns[1].status : undefined;

      const responseText = testRun.rawLog && typeof testRun.rawLog === 'object' && 'response' in testRun.rawLog
        ? String(testRun.rawLog.response)
        : '';

      const parsedDuration = testRun.durationMs ? parseInt(testRun.durationMs, 10) : null;
      
      brief.runContext = {
        testId,
        lastStatus: testRun.status,
        previousStatus,
        lastResponseSample: responseText ? responseText.substring(0, 200) : undefined,
        recentErrors: recentErrors.length,
        durationMs: parsedDuration !== null && !isNaN(parsedDuration) ? parsedDuration : undefined,
      };
    }
  }

  return brief;
}

export async function createPatchSuggestion(params: {
  investigationId: string;
  runId?: string;
  source: "human" | "agent" | "auto";
  patchText: string;
  summary?: string;
  externalLink?: string;
}): Promise<PatchSuggestion> {
  const inv = await db.query.investigations.findFirst({
    where: eq(investigations.id, params.investigationId),
  });

  if (!inv) {
    throw new Error(`Investigation ${params.investigationId} not found`);
  }

  // EVAL-008: Copy focus metadata from investigation to patch suggestion
  const runMeta = inv.run_meta as any;
  const meta: any = {};
  
  if (runMeta?.focus?.kind === 'behaviour-test') {
    meta.focus = {
      kind: runMeta.focus.kind,
      testId: runMeta.focus.testId,
      testName: runMeta.focus.testName,
    };
    meta.scopeNote = `Scoped to single behaviour test: ${runMeta.focus.testName} (${runMeta.focus.testId})`;
  }

  const [row] = await db
    .insert(patchSuggestions)
    .values({
      investigationId: params.investigationId,
      runId: params.runId ?? null,
      source: params.source,
      patchText: params.patchText,
      summary: params.summary ?? null,
      externalLink: params.externalLink ?? null,
      status: "suggested",
      meta,
    })
    .returning();

  return row;
}

export async function evaluatePatchSuggestion(
  suggestionId: string,
  patchEvaluator: PatchEvaluator
): Promise<{ suggestionId: string; evaluation: any }> {
  const suggestion = await db.query.patchSuggestions.findFirst({
    where: eq(patchSuggestions.id, suggestionId),
  });

  if (!suggestion) {
    throw new Error(`PatchSuggestion ${suggestionId} not found`);
  }

  await db
    .update(patchSuggestions)
    .set({ status: "evaluating", updatedAt: new Date() })
    .where(eq(patchSuggestions.id, suggestionId));

  try {
    // EVAL-008: Pass focus metadata to evaluator for logging
    const suggestionMeta = suggestion.meta as any;
    const focusMeta = suggestionMeta?.focus ? {
      kind: suggestionMeta.focus.kind,
      testId: suggestionMeta.focus.testId,
      testName: suggestionMeta.focus.testName,
      scopeNote: suggestionMeta.scopeNote,
    } : undefined;
    
    const evalResult = await patchEvaluator.evaluatePatch({
      patch: suggestion.patchText,
      focusMeta,
    });

    await db
      .update(patchSuggestions)
      .set({
        status: evalResult.status === "approved" ? "approved" : "rejected",
        patchEvaluationId: evalResult.id,
        meta: {
          ...(suggestion.meta ?? {}),
          evaluationReasons: evalResult.reasons,
          riskLevel: evalResult.riskLevel,
        },
        updatedAt: new Date(),
      })
      .where(eq(patchSuggestions.id, suggestionId));

    return { suggestionId, evaluation: evalResult };
  } catch (error) {
    await db
      .update(patchSuggestions)
      .set({
        status: "suggested",
        meta: {
          ...(suggestion.meta ?? {}),
          evaluationError: error instanceof Error ? error.message : 'Unknown error',
        },
        updatedAt: new Date(),
      })
      .where(eq(patchSuggestions.id, suggestionId));
    
    throw error;
  }
}

export async function updatePatchSuggestionStatus(
  suggestionId: string,
  newStatus: "applied" | "rejected",
  externalLink?: string,
  note?: string
): Promise<PatchSuggestion> {
  const suggestion = await db.query.patchSuggestions.findFirst({
    where: eq(patchSuggestions.id, suggestionId),
  });

  if (!suggestion) {
    throw new Error(`PatchSuggestion ${suggestionId} not found`);
  }

  if (suggestion.status === "suggested" || suggestion.status === "evaluating") {
    throw new Error(
      `Cannot mark suggestion as ${newStatus} - it must be evaluated first (current status: ${suggestion.status})`
    );
  }

  if (suggestion.status === "rejected" && newStatus === "applied") {
    throw new Error("Cannot mark a rejected suggestion as applied");
  }

  const updates: any = {
    status: newStatus,
    updatedAt: new Date(),
  };

  if (externalLink) {
    updates.externalLink = externalLink;
  }

  if (note) {
    updates.meta = {
      ...(suggestion.meta ?? {}),
      statusNote: note,
    };
  }

  await db
    .update(patchSuggestions)
    .set(updates)
    .where(eq(patchSuggestions.id, suggestionId));

  const [updatedSuggestion] = await db
    .select()
    .from(patchSuggestions)
    .where(eq(patchSuggestions.id, suggestionId));

  return updatedSuggestion;
}

export async function getPatchSuggestionsForInvestigation(
  investigationId: string
): Promise<Array<PatchSuggestion & { evaluation?: PatchEvaluation | null }>> {
  const suggestions = await db
    .select()
    .from(patchSuggestions)
    .where(eq(patchSuggestions.investigationId, investigationId))
    .orderBy(desc(patchSuggestions.createdAt));

  const enrichedSuggestions = await Promise.all(
    suggestions.map(async (suggestion) => {
      if (suggestion.patchEvaluationId) {
        const [evaluation] = await db
          .select()
          .from(patchEvaluations)
          .where(eq(patchEvaluations.id, suggestion.patchEvaluationId))
          .limit(1);
        return { ...suggestion, evaluation: evaluation || null };
      }
      return { ...suggestion, evaluation: null };
    })
  );

  return enrichedSuggestions;
}
