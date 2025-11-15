import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { executeInvestigation } from "./executeInvestigation";
import { storeInvestigation } from "./storeInvestigation";
import type { Investigation } from "./types";
import { and, eq, gte, sql } from "drizzle-orm";

export type BehaviourInvestigationOpts = {
  testId: string;
  testName: string;
  runId?: string;
  triggerReason: string;
  seriousness: 'info' | 'warning' | 'error';
  now?: Date;
};

const DEDUP_WINDOW_HOURS = 24;

export async function ensureBehaviourInvestigationForRun(
  opts: BehaviourInvestigationOpts
): Promise<Investigation> {
  const now = opts.now || new Date();
  const windowStart = new Date(now.getTime() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

  // Check for existing open investigation for this testId within the last 24 hours
  const existing = await db.query.investigations.findFirst({
    where: and(
      gte(investigations.created_at, windowStart),
      sql`${investigations.run_meta}->>'source' = 'behaviour-test'`,
      sql`${investigations.run_meta}->>'testId' = ${opts.testId}`
    ),
    orderBy: (investigations, { desc }) => [desc(investigations.created_at)],
  });

  if (existing) {
    console.log(
      `[BehaviourInvestigations] Found existing investigation ${existing.id} for testId=${opts.testId}`
    );

    // Update the existing investigation with new run info
    const updatedNotes = `${existing.notes || ''}\n\n[${now.toISOString()}] Additional trigger: ${opts.triggerReason}${
      opts.runId ? ` (run: ${opts.runId})` : ''
    }`;

    await db
      .update(investigations)
      .set({
        run_id: opts.runId || existing.run_id,
        notes: updatedNotes,
      })
      .where(eq(investigations.id, existing.id));

    // Fetch and return updated investigation
    const updated = await db.query.investigations.findFirst({
      where: eq(investigations.id, existing.id),
    });

    if (!updated) {
      throw new Error('Failed to fetch updated investigation');
    }

    return {
      id: updated.id,
      createdAt: updated.created_at,
      trigger: updated.trigger as Investigation['trigger'],
      runId: updated.run_id ?? undefined,
      notes: updated.notes ?? undefined,
      runLogs: updated.run_logs ?? [],
      runMeta: updated.run_meta ?? undefined,
      uiSnapshot: updated.ui_snapshot ?? null,
      supervisorSnapshot: updated.supervisor_snapshot ?? null,
      diagnosis: updated.diagnosis ?? null,
      patchSuggestion: updated.patch_suggestion ?? null,
    };
  }

  // Create new investigation
  console.log(
    `[BehaviourInvestigations] Creating new investigation for testId=${opts.testId}`
  );

  const title = `Behaviour test "${opts.testName}" ${
    opts.seriousness === 'error' ? 'is failing' : 'issue detected'
  }`;
  
  const summary = `Auto-created from behaviour test "${opts.testId}" due to: ${opts.triggerReason}.`;
  
  const notes = `${title}\n\n${summary}${
    opts.runId ? `\n\nRun ID: ${opts.runId}` : ''
  }\n\nCreated: ${now.toISOString()}`;

  // Map seriousness to trigger type
  const trigger = opts.seriousness === 'error' ? 'behaviour_flag' : 
                  opts.seriousness === 'warning' ? 'behaviour_flag' : 
                  'manual';

  const investigation = await executeInvestigation(trigger, opts.runId, notes);

  // Update run_meta to include behaviour test source information
  await db
    .update(investigations)
    .set({
      run_meta: {
        agent: 'tower' as const,
        description: `Behaviour test: ${opts.testName}`,
        source: 'behaviour-test',
        testId: opts.testId,
        testName: opts.testName,
        triggerReason: opts.triggerReason,
      } as any, // Cast to any because we're adding extra fields beyond the base type
    })
    .where(eq(investigations.id, investigation.id));

  // Fetch and return the updated investigation
  const updatedInv = await db.query.investigations.findFirst({
    where: eq(investigations.id, investigation.id),
  });

  if (!updatedInv) {
    throw new Error('Failed to fetch created investigation');
  }

  return {
    id: updatedInv.id,
    createdAt: updatedInv.created_at,
    trigger: updatedInv.trigger as Investigation['trigger'],
    runId: updatedInv.run_id ?? undefined,
    notes: updatedInv.notes ?? undefined,
    runLogs: updatedInv.run_logs ?? [],
    runMeta: updatedInv.run_meta ?? undefined,
    uiSnapshot: updatedInv.ui_snapshot ?? null,
    supervisorSnapshot: updatedInv.supervisor_snapshot ?? null,
    diagnosis: updatedInv.diagnosis ?? null,
    patchSuggestion: updatedInv.patch_suggestion ?? null,
  };
}
