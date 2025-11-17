import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { sql, and, gte, eq } from "drizzle-orm";
import type { Investigation, AutoConversationQualityMeta, WyshboneConversationAnalysis } from "./types";
import { storeInvestigation } from "./storeInvestigation";
import { runAutoConversationQualityAnalysis } from "./autoConversationQualityAnalysis";

const DEDUP_WINDOW_HOURS = 24;

export async function createAutoConversationQualityInvestigation(params: {
  runId: string;
  sessionId?: string;
  userId?: string | null;
  conversationTranscript: any[];
}): Promise<Investigation | null> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

  const dedupConditions = [
    gte(investigations.created_at, windowStart),
    sql`${investigations.run_meta}->>'source' = 'auto_conversation_quality'`,
    sql`${investigations.run_meta}->>'runId' = ${params.runId}`
  ];

  const existing = await db.query.investigations.findFirst({
    where: and(...dedupConditions),
    orderBy: (investigations, { desc }) => [desc(investigations.created_at)],
  });

  if (existing) {
    console.log(
      `[AutoConversationQualityInvestigations] Found existing investigation ${existing.id} for runId=${params.runId} within ${DEDUP_WINDOW_HOURS}h window. Skipping.`
    );
    return null;
  }

  const investigationId = `acq-${params.runId}-${Date.now()}`;

  const conversationMeta: AutoConversationQualityMeta = {
    source: "auto_conversation_quality",
    focus: {
      kind: "conversation",
    },
    runId: params.runId,
    sessionId: params.sessionId,
    userId: params.userId,
    conversation_transcript: params.conversationTranscript,
  };

  const notes = `Automatic Conversation Quality Investigation

Run ID: ${params.runId}
Session: ${params.sessionId || 'unknown'}
User: ${params.userId || 'anonymous'}

Created from automatic analysis of live user run at ${now.toISOString()}`;

  const investigation: Investigation = {
    id: investigationId,
    createdAt: now,
    trigger: "auto_conversation_quality",
    runId: params.runId,
    notes,
    runLogs: [],
    runMeta: conversationMeta as any,
  };

  await storeInvestigation(investigation);

  console.log(
    `[AutoConversationQualityInvestigations] Created investigation ${investigationId} for runId=${params.runId}`
  );

  processAutoConversationQualityInvestigation(investigationId).catch((err) => {
    console.error(`[AutoConversationQualityInvestigations] Failed to process investigation ${investigationId}:`, err);
  });

  return investigation;
}

async function processAutoConversationQualityInvestigation(investigationId: string): Promise<void> {
  console.log(`[AutoConversationQualityAnalysis] Processing investigation ${investigationId}`);

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

  const analysis = await runAutoConversationQualityAnalysis(typedInvestigation);

  if (!analysis) {
    console.log(`[AutoConversationQualityAnalysis] No failure detected for investigation ${investigationId}. Marking as clean.`);
    
    const updatedRunMeta = {
      ...(typedInvestigation.runMeta || {}),
      analysis: null,
      clean: true,
    };

    await db
      .update(investigations)
      .set({
        run_meta: updatedRunMeta,
        diagnosis: "No conversation quality issues detected",
      })
      .where(eq(investigations.id, investigationId));

    return;
  }

  const updatedRunMeta = {
    ...(typedInvestigation.runMeta || {}),
    analysis,
  };

  const diagnosis = `Automatic Conversation Quality Analysis

Failure Type: ${analysis.failure_type}
Severity: ${analysis.severity}

Summary: ${analysis.summary}

User Intent: ${analysis.user_intent}

Expected Behaviour:
${analysis.expected_behaviour}

Actual Behaviour:
${analysis.actual_behaviour}

Suggested Fix:
${analysis.suggested_fix}

${analysis.suggested_tests.length > 0 ? `Suggested Behaviour Tests:\n${analysis.suggested_tests.map((t, i) => `${i + 1}. ${t}`).join('\n')}` : ''}`;

  await db
    .update(investigations)
    .set({
      run_meta: updatedRunMeta,
      diagnosis,
    })
    .where(eq(investigations.id, investigationId));

  console.log(`[AutoConversationQualityAnalysis] Investigation ${investigationId} updated with analysis`);
  console.log(`  Failure Type: ${analysis.failure_type}, Severity: ${analysis.severity}`);
}

export async function getAllAutoConversationQualityInvestigations(): Promise<Investigation[]> {
  const rows = await db.query.investigations.findMany({
    where: sql`${investigations.run_meta}->>'source' = 'auto_conversation_quality'`,
    orderBy: (investigations, { desc }) => [desc(investigations.created_at)],
  });

  return rows.map((r) => ({
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
