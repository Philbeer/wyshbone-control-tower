import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { desc, sql, eq } from "drizzle-orm";
import type { Investigation, PatchFailureMeta } from "./types";
import { storeInvestigation } from "./storeInvestigation";

export async function createPatchFailureInvestigation(params: {
  originalInvestigationId: string;
  patchId: string;
  patchDiff: string;
  sandboxResult: {
    status: "rejected";
    reasons: string[];
    riskLevel?: string;
    testResultsBefore?: any[];
    testResultsAfter?: any[];
    diff?: any;
  };
}): Promise<Investigation> {
  const now = new Date();
  const investigationId = `pf-${params.patchId}-${Date.now()}`;

  console.log(`[PatchFailureInvestigations] Creating patch failure investigation ${investigationId} for patch ${params.patchId}`);

  // Each patch failure gets its own investigation - no deduplication
  // Multiple patches for the same investigation are tracked separately

  const runMeta: PatchFailureMeta = {
    source: "patch_failure",
    focus: {
      kind: "patch",
    },
    original_investigation_id: params.originalInvestigationId,
    patch_id: params.patchId,
    patch_diff: params.patchDiff,
    sandbox_result: params.sandboxResult,
  };

  const notes = `Patch Failure Investigation

Original Investigation: ${params.originalInvestigationId}
Patch ID: ${params.patchId}
Rejection Reasons:
${params.sandboxResult.reasons.map(r => `  - ${r}`).join('\n')}

Risk Level: ${params.sandboxResult.riskLevel || 'unknown'}`;

  const investigation: Investigation = {
    id: investigationId,
    createdAt: now,
    trigger: "patch_failure",
    notes,
    runLogs: [],
    runMeta,
    uiSnapshot: null,
    supervisorSnapshot: null,
    diagnosis: null,
    patchSuggestion: null,
  };

  await storeInvestigation(investigation);

  console.log(`[PatchFailureInvestigations] Created patch failure investigation ${investigationId}`);

  // Trigger async analysis
  processPatchFailureInvestigation(investigationId).catch((err) => {
    console.error(`[PatchFailureInvestigations] Failed to process investigation ${investigationId}:`, err);
  });

  return investigation;
}

async function processPatchFailureInvestigation(investigationId: string): Promise<void> {
  console.log(`[PatchFailureInvestigations] Starting post-mortem analysis for ${investigationId}`);

  // Fetch investigation
  const investigation = await db.query.investigations.findFirst({
    where: eq(investigations.id, investigationId),
  });

  if (!investigation) {
    throw new Error(`Investigation ${investigationId} not found`);
  }

  const typedInvestigation: Investigation = {
    id: investigation.id,
    createdAt: investigation.created_at,
    trigger: investigation.trigger as any,
    runId: investigation.run_id ?? undefined,
    notes: investigation.notes ?? undefined,
    runLogs: investigation.run_logs ?? [],
    runMeta: investigation.run_meta ?? undefined,
    uiSnapshot: investigation.ui_snapshot ?? null,
    supervisorSnapshot: investigation.supervisor_snapshot ?? null,
    diagnosis: investigation.diagnosis ?? null,
    patchSuggestion: investigation.patch_suggestion ?? null,
  };

  // Run analysis
  const { analyzePatchFailure } = await import("./patchFailureAnalysis");
  const analysis = await analyzePatchFailure(typedInvestigation);

  // Store analysis back in run_meta
  const updatedRunMeta = {
    ...(typedInvestigation.runMeta || {}),
    analysis,
  };

  // Also store a human-readable diagnosis
  const diagnosis = `Patch Failure Post-Mortem

Category: ${analysis.failure_category}
Failure Reason: ${analysis.failure_reason}

Next Step:
${analysis.next_step}

${analysis.suggested_constraints_for_next_patch ? `Suggested Constraints for Next Patch:\n${analysis.suggested_constraints_for_next_patch}` : ''}`;

  await db
    .update(investigations)
    .set({
      run_meta: updatedRunMeta,
      diagnosis,
    })
    .where(eq(investigations.id, investigationId));

  console.log(`[PatchFailureInvestigations] Post-mortem analysis complete for ${investigationId}`);
  console.log(`  Category: ${analysis.failure_category}`);
  console.log(`  Next Step: ${analysis.next_step}`);
}

export async function getAllPatchFailureInvestigations(): Promise<Investigation[]> {
  const allRows = await db
    .select()
    .from(investigations)
    .where(sql`${investigations.run_meta}->>'source' = 'patch_failure'`)
    .orderBy(desc(investigations.created_at));

  return allRows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    trigger: r.trigger as any,
    runId: r.run_id ?? undefined,
    notes: r.notes ?? undefined,
    runLogs: r.run_logs ?? [],
    runMeta: r.run_meta ?? undefined,
    uiSnapshot: r.ui_snapshot ?? null,
    supervisorSnapshot: r.supervisor_snapshot ?? null,
    diagnosis: r.diagnosis ?? null,
    patchSuggestion: r.patch_suggestion ?? null,
  }));
}
