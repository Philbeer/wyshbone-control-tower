import express from "express";
import { getAllAutoConversationQualityInvestigations } from "../src/evaluator/autoConversationQualityInvestigations";

const router = express.Router();

router.get("/auto-conversation-quality", async (req, res) => {
  try {
    console.log("[AutoConversationQualityAPI] Fetching all auto conversation quality investigations");
    const investigations = await getAllAutoConversationQualityInvestigations();
    res.json(investigations);
  } catch (error: any) {
    console.error("[AutoConversationQualityAPI] Error fetching investigations:", error);
    res.status(500).json({
      error: "Failed to fetch auto conversation quality investigations",
      details: error.message
    });
  }
});

export default router;
