import { Router } from "express";
import { db } from "../src/lib/db";
import { investigations, runs } from "@shared/schema";
import { and, eq, gte } from "drizzle-orm";

const router = Router();

// POST /tower/runs/:id/flag - Flag a run manually
router.post("/runs/:id/flag", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Fetch the run
    const run = await db.query.runs.findFirst({
      where: eq(runs.id, id),
    });

    if (!run) {
      return res.status(404).json({ error: "Run not found" });
    }

    // Check for existing manual flag within 24 hours
    const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const existing = await db.query.investigations.findFirst({
      where: and(
        gte(investigations.created_at, windowStart),
        eq(investigations.run_id, id),
        eq(investigations.trigger, "manual_flag")
      ),
    });

    if (existing) {
      // Update existing investigation with new reason if provided
      const updatedNotes = `${existing.notes || ""}\n\n[${new Date().toISOString()}] Updated manual flag${reason ? `: ${reason}` : ""}`;
      
      await db
        .update(investigations)
        .set({ notes: updatedNotes })
        .where(eq(investigations.id, existing.id));

      return res.json({
        investigation_id: existing.id,
        status: "updated",
        message: "Existing manual flag updated",
      });
    }

    // Create new manual flag investigation
    const investigationId = `manual-${id}-${Date.now()}`;
    const investigation = {
      id: investigationId,
      trigger: "manual_flag",
      run_id: id,
      notes: reason || "Manually flagged for review",
      run_logs: [],
      run_meta: {
        userId: run.user_identifier || undefined,
        source: "manual_flag",
        flagged_at: new Date().toISOString(),
        original_source: run.source,
        goal_summary: run.goal_summary,
        status: run.status,
      } as any,
    };

    await db.insert(investigations).values([investigation]);

    console.log(`[ManualFlags] Created manual flag investigation ${investigationId} for run ${id}`);

    res.json({
      investigation_id: investigationId,
      status: "created",
      message: "Run flagged successfully",
    });
  } catch (error: any) {
    console.error("[ManualFlags] Error flagging run:", error);
    res.status(500).json({
      error: "Failed to flag run",
      details: error.message,
    });
  }
});

// GET /tower/manual-flags - Get all manually flagged runs
router.get("/manual-flags", async (req, res) => {
  try {
    console.log("[ManualFlags] Fetching all manual flag investigations");

    const manualFlags = await db.query.investigations.findMany({
      where: eq(investigations.trigger, "manual_flag"),
      orderBy: (inv, { desc }) => [desc(inv.created_at)],
    });

    console.log(`[ManualFlags] Found ${manualFlags.length} manual flag(s)`);

    res.json(manualFlags);
  } catch (error: any) {
    console.error("[ManualFlags] Error fetching manual flags:", error);
    res.status(500).json({
      error: "Failed to fetch manual flags",
      details: error.message,
    });
  }
});

export default router;
