import express from "express";
import { getAllPatchFailureInvestigations } from "../src/evaluator/patchFailureInvestigations";

const router = express.Router();

router.get("/patch-failures", async (req, res) => {
  try {
    console.log("[PatchFailuresAPI] Fetching all patch failure investigations");
    const investigations = await getAllPatchFailureInvestigations();
    res.json(investigations);
  } catch (error: any) {
    console.error("[PatchFailuresAPI] Error fetching investigations:", error);
    res.status(500).json({
      error: "Failed to fetch patch failure investigations",
      details: error.message
    });
  }
});

export default router;
