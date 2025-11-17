import { Router } from "express";
import { db } from "../src/lib/db";
import { investigations, patchEvaluations, patchSuggestions } from "@shared/schema";
import { or, eq, inArray } from "drizzle-orm";

const router = Router();

// POST /tower/reset-investigations - Clear all flags and investigations
router.post("/reset-investigations", async (req, res) => {
  try {
    console.log("[Reset] Starting Tower data reset...");

    // Delete all investigations except those needed for system operation
    const investigationTypes = [
      "manual_flag",
      "conversation_quality",
      "auto_conversation_quality",
      "behaviour_test",
      "patch_failure",
      "auto_detect",
    ];

    const deletedInvestigations = await db
      .delete(investigations)
      .where(inArray(investigations.trigger, investigationTypes))
      .returning({ id: investigations.id });

    // Delete all patch evaluations
    const deletedEvaluations = await db
      .delete(patchEvaluations)
      .returning({ id: patchEvaluations.id });

    // Delete all patch suggestions
    const deletedSuggestions = await db
      .delete(patchSuggestions)
      .returning({ id: patchSuggestions.id });

    console.log(`[Reset] Deleted ${deletedInvestigations.length} investigations`);
    console.log(`[Reset] Deleted ${deletedEvaluations.length} patch evaluations`);
    console.log(`[Reset] Deleted ${deletedSuggestions.length} patch suggestions`);

    res.json({
      success: true,
      deleted: {
        investigations: deletedInvestigations.length,
        patch_evaluations: deletedEvaluations.length,
        patch_suggestions: deletedSuggestions.length,
      },
      message: "Tower data reset successfully",
    });
  } catch (error: any) {
    console.error("[Reset] Error resetting Tower data:", error);
    res.status(500).json({
      error: "Failed to reset Tower data",
      details: error.message,
    });
  }
});

export default router;
