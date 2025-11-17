import { Router } from "express";
import { db } from "../src/lib/db";
import { investigations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { runInvestigation } from "../src/evaluator/investigationEvaluator";

const router = Router();

// GET /tower/investigations/:id - Get a specific investigation
router.get("/investigations/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const investigation = await db.query.investigations.findFirst({
      where: eq(investigations.id, id),
    });

    if (!investigation) {
      return res.status(404).json({ error: "Investigation not found" });
    }

    res.json(investigation);
  } catch (error: any) {
    console.error("[InvestigateAPI] Error fetching investigation:", error);
    res.status(500).json({
      error: "Failed to fetch investigation",
      details: error.message,
    });
  }
});

// POST /tower/investigations/:id/evaluate - Trigger OpenAI evaluation for an investigation
router.post("/investigations/:id/evaluate", async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[InvestigateAPI] Evaluating investigation ${id}`);

    // Run the investigation evaluation
    const result = await runInvestigation(id);

    // Fetch the updated investigation to return
    const investigation = await db.query.investigations.findFirst({
      where: eq(investigations.id, id),
    });

    if (!investigation) {
      return res.status(404).json({ error: "Investigation not found after evaluation" });
    }

    console.log(`[InvestigateAPI] Successfully evaluated investigation ${id}`);
    res.json(investigation);
  } catch (error: any) {
    console.error(`[InvestigateAPI] Error evaluating investigation:`, error);
    res.status(500).json({
      error: "Failed to evaluate investigation",
      details: error.message,
    });
  }
});

export default router;
