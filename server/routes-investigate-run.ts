import { Router } from "express";
import { db } from "../src/lib/db";
import { investigations, runs } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// POST /tower/investigate-run - Create an investigation for a specific run
router.post("/investigate-run", async (req, res) => {
  try {
    const { runId } = req.body;

    if (!runId) {
      return res.status(400).json({ error: "runId is required" });
    }

    // Fetch the run
    const run = await db.query.runs.findFirst({
      where: eq(runs.id, runId),
    });

    if (!run) {
      return res.status(404).json({ error: "Run not found" });
    }

    // Create a new investigation for this run
    const investigationId = `inv-${runId}-${Date.now()}`;
    const investigation = {
      id: investigationId,
      trigger: "manual_investigate",
      run_id: runId,
      notes: "Manual investigation from dashboard",
      run_logs: [],
      run_meta: {
        userId: run.user_identifier || undefined,
        source: run.source,
        goal_summary: run.goal_summary,
        status: run.status,
        output: run.meta?.output,
      } as any,
    };

    await db.insert(investigations).values([investigation]);

    console.log(`[InvestigateRun] Created investigation ${investigationId} for run ${runId}`);

    res.json({
      investigation_id: investigationId,
      status: "created",
      message: "Investigation created successfully",
    });
  } catch (error: any) {
    console.error("[InvestigateRun] Error creating investigation:", error);
    res.status(500).json({
      error: "Failed to create investigation",
      details: error.message,
    });
  }
});

export default router;
