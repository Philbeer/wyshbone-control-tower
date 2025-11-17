import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import type { Investigation, PatchFailureMeta } from "./types";
import { storeInvestigation } from "./storeInvestigation";

const DEDUP_WINDOW_HOURS = 24;

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
  const investigationId = `pf-${params.originalInvestigationId}-${Date.now()}`;

  console.log(`[PatchFailureInvestigations] Creating patch failure investigation ${investigationId} for investigation ${params.originalInvestigationId}`);

  // Check for existing patch failure investigation within dedup window
  const dedupCutoff = new Date(now.getTime() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
  
  const dedupConditions = [
    sql`${investigations.created_at} >= ${dedupCutoff.toISOString()}`,
    sql`${investigations.run_meta}->>'source' = 'patch_failure'`,
    sql`${investigations.run_meta}->>'original_investigation_id' = ${params.originalInvestigationId}`,
  ];

  const existing = await db.query.investigations.findFirst({
    where: and(...dedupConditions),
    orderBy: (investigations, { desc }) => [desc(investigations.created_at)],
  });

  if (existing) {
    console.log(
      `[PatchFailureInvestigations] Found existing patch failure investigation ${existing.id} for originalInvestigationId=${params.originalInvestigationId} within ${DEDUP_WINDOW_HOURS}h window`
    );

    // Update notes to include this additional failure
    const updatedNotes = `${existing.notes || ''}\n\n[${now.toISOString()}] Additional patch failure for same investigation\nPatch ID: ${params.patchId}\nReasons: ${params.sandboxResult.reasons.join(', ')}`;
    
    // Update metadata with the latest failure
    const existingMeta = existing.run_meta as any;
    const updatedMeta: PatchFailureMeta = {
      ...existingMeta,
      patch_id: params.patchId,
      patch_diff: params.patchDiff,
      sandbox_result: params.sandboxResult,
    };

    await db
      .update(investigations)
      .set({ 
        notes: updatedNotes,
        run_meta: updatedMeta as any,
      })
      .where(sql`${investigations.id} = ${existing.id}`);
    
    // Trigger reanalysis for the updated failure
    console.log(`[PatchFailureInvestigations] Triggering reanalysis for updated investigation ${existing.id}`);
    processPatchFailureInvestigation(existing.id).catch((err) => {
      console.error(`[PatchFailureInvestigations] Failed to reprocess investigation ${existing.id}:`, err);
    });

    return {
      id: existing.id,
      createdAt: existing.created_at,
      trigger: existing.trigger as any,
      runId: existing.run_id ?? undefined,
      notes: updatedNotes,
      runLogs: existing.run_logs ?? [],
      runMeta: updatedMeta,
      uiSnapshot: existing.ui_snapshot ?? null,
      supervisorSnapshot: existing.supervisor_snapshot ?? null,
      diagnosis: existing.diagnosis ?? null,
      patchSuggestion: existing.patch_suggestion ?? null,
    };
  }

  // Create new investigation
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

  const { analyzePatchFailure } = await import("./patchFailureAnalysis");
  
  const analysis = await analyzePatchFailure(investigationId);

  console.log(`[PatchFailureInvestigations] Post-mortem analysis complete for ${investigationId}`);
  console.log(`  Category: ${analysis.failure_category}`);
  console.log(`  Next Step: ${analysis.next_step}`);
}

export async function getAllPatchFailureInvestigations(): Promise<Investigation[]> {
  const rows = await db.query.investigations.findFirst({
    where: sql`${investigations.run_meta}->>'source' = 'patch_failure'`,
    orderBy: desc(investigations.created_at),
  });

  if (!rows) {
    return [];
  }

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
