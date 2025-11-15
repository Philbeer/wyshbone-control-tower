import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { executeInvestigation } from "./executeInvestigation";
import { storeInvestigation } from "./storeInvestigation";
import type { Investigation } from "./types";
import { and, eq, gte, sql, isNull, or } from "drizzle-orm";

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

  // Primary query: Check for existing investigation with populated run_meta
  let existing = await db.query.investigations.findFirst({
    where: and(
      gte(investigations.created_at, windowStart),
      sql`${investigations.run_meta}->>'source' = 'behaviour_test'`,
      sql`${investigations.run_meta}->>'testId' = ${opts.testId}`
    ),
    orderBy: (investigations, { desc }) => [desc(investigations.created_at)],
  });

  // Fallback query: Check for legacy investigations without run_meta
  // Look for investigations with "Behaviour test" in notes (standard prefix)
  if (!existing) {
    const legacyCandidates = await db.query.investigations.findMany({
      where: and(
        gte(investigations.created_at, windowStart),
        sql`${investigations.notes} LIKE 'Behaviour test "%'`
      ),
      orderBy: (investigations, { desc }) => [desc(investigations.created_at)],
      limit: 10, // Check up to 10 recent candidates
    });

    // Find first candidate that matches this testId by parsing notes
    for (const candidate of legacyCandidates) {
      const notesText = candidate.notes || '';
      // Check if notes mention this specific test
      if (notesText.includes(`"${opts.testName}"`) || notesText.includes(`"${opts.testId}"`)) {
        existing = candidate;
        console.log(
          `[BehaviourInvestigations] Found legacy investigation ${candidate.id} for testId=${opts.testId} (will self-heal)`
        );
        break;
      }
    }
  }

  if (existing) {
    console.log(
      `[BehaviourInvestigations] Found existing investigation ${existing.id} for testId=${opts.testId}`
    );

    // Update the existing investigation with new run info and ensure run_meta is populated
    const updatedNotes = `${existing.notes || ''}\n\n[${now.toISOString()}] Additional trigger: ${opts.triggerReason}${
      opts.runId ? ` (run: ${opts.runId})` : ''
    }`;

    // Ensure run_meta is always populated with behaviour test metadata
    // EVAL-008: Include single-test focus for surgical patch generation
    const ensuredRunMeta = {
      ...(existing.run_meta || {}),
      agent: 'tower' as const,
      description: `Behaviour test: ${opts.testName}`,
      source: 'behaviour_test',
      type: 'behaviour-single-test',
      testId: opts.testId,
      testName: opts.testName,
      triggerReason: opts.triggerReason,
      focus: {
        kind: 'behaviour-test',
        testId: opts.testId,
        testName: opts.testName,
      },
    };

    await db
      .update(investigations)
      .set({
        run_id: opts.runId || existing.run_id,
        notes: updatedNotes,
        run_meta: ensuredRunMeta as any,
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
  // EVAL-008: Include single-test focus for surgical patch generation
  await db
    .update(investigations)
    .set({
      run_meta: {
        agent: 'tower' as const,
        description: `Behaviour test: ${opts.testName}`,
        source: 'behaviour_test',
        type: 'behaviour-single-test',
        testId: opts.testId,
        testName: opts.testName,
        triggerReason: opts.triggerReason,
        focus: {
          kind: 'behaviour-test',
          testId: opts.testId,
          testName: opts.testName,
        },
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

export async function backfillBehaviourTestInvestigations(): Promise<number> {
  console.log('[BehaviourInvestigations] Starting backfill of legacy investigations...');
  
  // Find all investigations that look like behaviour test investigations but lack run_meta
  const candidates = await db.query.investigations.findMany({
    where: and(
      or(
        isNull(investigations.run_meta),
        sql`${investigations.run_meta}->>'source' IS NULL`
      ),
      sql`${investigations.notes} LIKE 'Behaviour test "%'`
    ),
  });

  console.log(`[BehaviourInvestigations] Found ${candidates.length} candidates for backfill`);
  
  let updated = 0;
  for (const inv of candidates) {
    const notesText = inv.notes || '';
    
    // Extract test name from notes (format: Behaviour test "TestName" ...)
    const testNameMatch = notesText.match(/Behaviour test "([^"]+)"/);
    if (!testNameMatch) continue;
    
    const testName = testNameMatch[1];
    
    // Try to extract testId from notes (format: ...test "testId"...)
    let testId = '';
    const testIdMatch = notesText.match(/test "([^"]+)"/);
    if (testIdMatch) {
      testId = testIdMatch[1];
    }
    
    // If we couldn't extract testId, derive it from test name
    if (!testId) {
      testId = testName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    }
    
    // Populate run_meta
    await db
      .update(investigations)
      .set({
        run_meta: {
          agent: 'tower' as const,
          description: `Behaviour test: ${testName}`,
          source: 'behaviour_test',
          testId,
          testName,
          triggerReason: 'Backfilled from legacy investigation',
        } as any,
      })
      .where(eq(investigations.id, inv.id));
    
    updated++;
    console.log(`[BehaviourInvestigations] Backfilled investigation ${inv.id} for test "${testName}"`);
  }
  
  console.log(`[BehaviourInvestigations] Backfill complete: ${updated} investigations updated`);
  return updated;
}
