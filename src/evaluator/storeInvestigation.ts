import { db } from "../lib/db";
import type { Investigation as InvestigationType } from "./types";
import { investigations } from "../../shared/schema";
import { eq, desc } from "drizzle-orm";

export async function storeInvestigation(
  inv: InvestigationType
): Promise<void> {
  await db
    .insert(investigations)
    .values({
      id: inv.id,
      created_at: inv.createdAt,
      trigger: inv.trigger,
      run_id: inv.runId ?? null,
      notes: inv.notes ?? null,
      run_logs: inv.runLogs,
      run_meta: inv.runMeta ?? null,
      ui_snapshot: inv.uiSnapshot ?? null,
      supervisor_snapshot: inv.supervisorSnapshot ?? null,
      diagnosis: inv.diagnosis ?? null,
      patch_suggestion: inv.patchSuggestion ?? null,
    })
    .onConflictDoUpdate({
      target: investigations.id,
      set: {
        trigger: inv.trigger,
        run_id: inv.runId ?? null,
        notes: inv.notes ?? null,
        run_logs: inv.runLogs,
        run_meta: inv.runMeta ?? null,
        ui_snapshot: inv.uiSnapshot ?? null,
        supervisor_snapshot: inv.supervisorSnapshot ?? null,
        diagnosis: inv.diagnosis ?? null,
        patch_suggestion: inv.patchSuggestion ?? null,
      },
    });
}

export async function getAllInvestigations(): Promise<InvestigationType[]> {
  const rows = await db
    .select()
    .from(investigations)
    .orderBy(desc(investigations.created_at));

  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    trigger: r.trigger as InvestigationType["trigger"],
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

export async function getInvestigationById(
  id: string
): Promise<InvestigationType | null> {
  const row = await db.query.investigations.findFirst({
    where: eq(investigations.id, id),
  });

  if (!row) return null;

  return {
    id: row.id,
    createdAt: row.created_at,
    trigger: row.trigger as InvestigationType["trigger"],
    runId: row.run_id ?? undefined,
    notes: row.notes ?? undefined,
    runLogs: row.run_logs ?? [],
    runMeta: row.run_meta ?? undefined,
    uiSnapshot: row.ui_snapshot ?? null,
    supervisorSnapshot: row.supervisor_snapshot ?? null,
    diagnosis: row.diagnosis ?? null,
    patchSuggestion: row.patch_suggestion ?? null,
  };
}
