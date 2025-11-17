import { Router } from "express";
import { db } from "../src/lib/db";
import { investigations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { runInvestigation } from "../src/evaluator/investigationEvaluator";
import { generateReplitPatchPrompt } from "../src/evaluator/promptGenerator";

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

// POST /tower/investigations/:id/generate-prompt - Generate Replit patch prompt
router.post("/investigations/:id/generate-prompt", async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[InvestigateAPI] Generating Replit prompt for investigation ${id}`);

    // Load the investigation
    const investigation = await db.query.investigations.findFirst({
      where: eq(investigations.id, id),
    });

    if (!investigation) {
      return res.status(404).json({ error: "Investigation not found" });
    }

    // Check if patch_suggestion exists
    if (!investigation.patch_suggestion) {
      return res.status(400).json({
        error: "Cannot generate prompt: investigation has no patch suggestion",
      });
    }

    // Generate the Replit patch prompt
    const replitPatchPrompt = generateReplitPatchPrompt(investigation.patch_suggestion);

    // Update the investigation with the generated prompt
    await db
      .update(investigations)
      .set({
        replit_patch_prompt: replitPatchPrompt,
      })
      .where(eq(investigations.id, id));

    console.log(`[InvestigateAPI] Successfully generated Replit prompt for investigation ${id}`);

    // Return the updated investigation
    const updatedInvestigation = await db.query.investigations.findFirst({
      where: eq(investigations.id, id),
    });

    res.json(updatedInvestigation);
  } catch (error: any) {
    console.error(`[InvestigateAPI] Error generating prompt:`, error);
    res.status(500).json({
      error: "Failed to generate Replit prompt",
      details: error.message,
    });
  }
});

export default router;
