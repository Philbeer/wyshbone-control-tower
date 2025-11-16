import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { sql, and, gte } from "drizzle-orm";
import type { Investigation, ConversationQualityMeta } from "./types";
import { storeInvestigation } from "./storeInvestigation";
import { processConversationQualityInvestigation } from "./conversationQualityAnalysis";

export interface CreateConversationQualityInvestigationParams {
  sessionId: string;
  userId?: string | null;
  messages: any[];
  flagged_message_index: number;
  user_note?: string;
}

const DEDUP_WINDOW_HOURS = 24;

export async function createConversationQualityInvestigation(
  params: CreateConversationQualityInvestigationParams
): Promise<Investigation> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

  // Check for existing investigation within dedup window
  const dedupConditions = [
    gte(investigations.created_at, windowStart),
    sql`${investigations.run_meta}->>'source' = 'conversation_quality'`,
    sql`${investigations.run_meta}->>'sessionId' = ${params.sessionId}`
  ];

  const existing = await db.query.investigations.findFirst({
    where: and(...dedupConditions),
    orderBy: (investigations, { desc }) => [desc(investigations.created_at)],
  });

  if (existing) {
    console.log(
      `[ConversationQualityInvestigations] Found existing investigation ${existing.id} for sessionId=${params.sessionId} within ${DEDUP_WINDOW_HOURS}h window`
    );

    // Update notes and metadata to include this additional flag
    const updatedNotes = `${existing.notes || ''}\n\n[${now.toISOString()}] Additional conversation flag from same session${params.user_note ? `: ${params.user_note}` : ''}`;
    
    // Update conversation window with new messages and flagged index
    const existingMeta = existing.run_meta as any;
    const updatedMeta = {
      ...existingMeta,
      conversation_window: params.messages,
      flagged_message_index: params.flagged_message_index,
      user_note: params.user_note || existingMeta.user_note,
    };

    await db
      .update(investigations)
      .set({ 
        notes: updatedNotes,
        run_meta: updatedMeta,
      })
      .where(sql`${investigations.id} = ${existing.id}`);
    
    // Trigger reanalysis for the updated conversation
    console.log(`[ConversationQualityInvestigations] Triggering reanalysis for updated investigation ${existing.id}`);
    processConversationQualityInvestigation(existing.id).catch((err) => {
      console.error(`[ConversationQualityInvestigations] Failed to reprocess investigation ${existing.id}:`, err);
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
  const investigationId = `cq-${params.sessionId}-${Date.now()}`;

  const conversationMeta: ConversationQualityMeta = {
    source: "conversation_quality",
    focus: {
      kind: "conversation",
    },
    sessionId: params.sessionId,
    userId: params.userId,
    flagged_message_index: params.flagged_message_index,
    conversation_window: params.messages,
    user_note: params.user_note,
  };

  const notes = `Conversation Quality Investigation

Session: ${params.sessionId}
User: ${params.userId || 'anonymous'}
Flagged Message Index: ${params.flagged_message_index}
${params.user_note ? `\nUser Note: ${params.user_note}` : ''}

Created from conversation flag at ${now.toISOString()}`;

  const investigation: Investigation = {
    id: investigationId,
    createdAt: now,
    trigger: "conversation_quality",
    notes,
    runLogs: [],
    runMeta: conversationMeta as any,
  };

  await storeInvestigation(investigation);

  console.log(
    `[ConversationQualityInvestigations] Created investigation ${investigationId} for sessionId=${params.sessionId}`
  );

  // Trigger async analysis (don't await)
  processConversationQualityInvestigation(investigationId).catch((err) => {
    console.error(`[ConversationQualityInvestigations] Failed to process investigation ${investigationId}:`, err);
  });

  return investigation;
}

export async function getAllConversationQualityInvestigations(): Promise<Investigation[]> {
  const rows = await db.query.investigations.findMany({
    where: sql`${investigations.run_meta}->>'source' = 'conversation_quality'`,
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
