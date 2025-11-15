import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { and, gte, sql, eq } from "drizzle-orm";
import { executeInvestigation } from "./executeInvestigation";

const DEDUP_WINDOW_HOURS = 24;

export type LiveUserInvestigationOpts = {
  runId: string;
  userId?: string | null;
  sessionId?: string | null;
  inputText: string;
  triggerReason: string;
  seriousness?: "error" | "warning" | "info";
  now?: Date;
};

export async function ensureLiveUserInvestigationForRun(
  opts: LiveUserInvestigationOpts
): Promise<any> {
  const now = opts.now || new Date();
  const windowStart = new Date(now.getTime() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);

  // Build dedup conditions based on available identifiers
  const dedupConditions = [
    gte(investigations.created_at, windowStart),
    sql`${investigations.run_meta}->>'source' = 'live_user'`
  ];

  // Dedupe by userId if available, otherwise by sessionId
  // For anonymous runs (no userId or sessionId), we still dedupe by treating them as a group
  if (opts.userId) {
    dedupConditions.push(sql`${investigations.run_meta}->>'userId' = ${opts.userId}`);
  } else if (opts.sessionId) {
    dedupConditions.push(sql`${investigations.run_meta}->>'sessionId' = ${opts.sessionId}`);
  } else {
    // For anonymous runs, dedupe by checking for runs without userId AND sessionId
    // Use COALESCE to handle null/missing JSON keys properly
    dedupConditions.push(sql`COALESCE(${investigations.run_meta}->>'userId', '') = ''`);
    dedupConditions.push(sql`COALESCE(${investigations.run_meta}->>'sessionId', '') = ''`);
  }

  // Check for existing investigation within the dedup window
  const existing = await db.query.investigations.findFirst({
    where: and(...dedupConditions),
    orderBy: (investigations, { desc }) => [desc(investigations.created_at)],
  });

  if (existing) {
    console.log(
      `[LiveUserInvestigations] Found existing investigation ${existing.id} for user=${opts.userId || 'anon'}, session=${opts.sessionId || 'none'}`
    );

    // Update with new trigger info including the new runId
    const updatedNotes = `${existing.notes || ""}\n\n[${now.toISOString()}] Additional trigger: ${opts.triggerReason} (run: ${opts.runId})`;

    const ensuredRunMeta = {
      ...(existing.run_meta || {}),
      agent: "ui" as const,
      description: `Live user run: ${opts.inputText.substring(0, 100)}`,
      source: "live_user",
      userId: opts.userId || null,
      sessionId: opts.sessionId || null,
    };

    await db
      .update(investigations)
      .set({
        notes: updatedNotes,
        run_meta: ensuredRunMeta as any,
      })
      .where(eq(investigations.id, existing.id));

    const updated = await db.query.investigations.findFirst({
      where: eq(investigations.id, existing.id),
    });

    return {
      id: updated!.id,
      createdAt: updated!.created_at,
      trigger: updated!.trigger as any,
      runId: updated!.run_id ?? undefined,
      notes: updated!.notes ?? undefined,
      runLogs: updated!.run_logs ?? [],
      runMeta: updated!.run_meta ?? undefined,
      uiSnapshot: updated!.ui_snapshot ?? null,
      supervisorSnapshot: updated!.supervisor_snapshot ?? null,
      diagnosis: updated!.diagnosis ?? null,
      patchSuggestion: updated!.patch_suggestion ?? null,
    };
  }

  // Create new investigation
  const notes = `🤖 AUTO/USER-TRIGGERED INVESTIGATION (LIVE RUN)
Source: live_user
Run ID: ${opts.runId}
User: ${opts.userId || "anonymous"}
Session: ${opts.sessionId || "N/A"}
Status: ${opts.seriousness || "info"}
Trigger: ${opts.triggerReason}

User Input:
${opts.inputText}

---
[${now.toISOString()}] Investigation created for live user run`;

  const trigger = opts.seriousness === "error" ? "tool_error" : "manual-from-run";

  const investigation = await executeInvestigation(trigger, opts.runId, notes);

  // Update run_meta to include live user source information
  await db
    .update(investigations)
    .set({
      run_meta: {
        agent: "ui" as const,
        description: `Live user run: ${opts.inputText.substring(0, 100)}`,
        source: "live_user",
        userId: opts.userId || null,
        sessionId: opts.sessionId || null,
        triggerReason: opts.triggerReason,
      } as any,
    })
    .where(eq(investigations.id, investigation.id));

  const updatedInv = await db.query.investigations.findFirst({
    where: eq(investigations.id, investigation.id),
  });

  return {
    id: updatedInv!.id,
    createdAt: updatedInv!.created_at,
    trigger: updatedInv!.trigger as any,
    runId: updatedInv!.run_id ?? undefined,
    notes: updatedInv!.notes ?? undefined,
    runLogs: updatedInv!.run_logs ?? [],
    runMeta: updatedInv!.run_meta ?? undefined,
    uiSnapshot: updatedInv!.ui_snapshot ?? null,
    supervisorSnapshot: updatedInv!.supervisor_snapshot ?? null,
    diagnosis: updatedInv!.diagnosis ?? null,
    patchSuggestion: updatedInv!.patch_suggestion ?? null,
  };
}
