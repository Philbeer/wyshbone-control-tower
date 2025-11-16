import express from "express";
import { createConversationQualityInvestigation, getAllConversationQualityInvestigations } from "../src/evaluator/conversationQualityInvestigations";

const router = express.Router();

router.get("/conversation-quality", async (req, res) => {
  try {
    console.log("[ConversationQualityAPI] Fetching all conversation quality investigations");
    const investigations = await getAllConversationQualityInvestigations();
    res.json(investigations);
  } catch (error: any) {
    console.error("[ConversationQualityAPI] Error fetching investigations:", error);
    res.status(500).json({
      error: "Failed to fetch conversation quality investigations",
      details: error.message
    });
  }
});

router.post("/conversation-flag", async (req, res) => {
  try {
    const { session_id, user_id, messages, flagged_message_index, user_note } = req.body;

    // Validate required fields
    if (!session_id || typeof session_id !== "string") {
      return res.status(400).json({ error: "session_id is required and must be a string" });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages is required and must be a non-empty array" });
    }

    if (typeof flagged_message_index !== "number" || flagged_message_index < 0 || flagged_message_index >= messages.length) {
      return res.status(400).json({
        error: "flagged_message_index must be a valid index within the messages array"
      });
    }

    if (user_id !== undefined && user_id !== null && typeof user_id !== "string") {
      return res.status(400).json({ error: "user_id must be a string or null" });
    }

    if (user_note !== undefined && typeof user_note !== "string") {
      return res.status(400).json({ error: "user_note must be a string if provided" });
    }

    console.log(`[ConversationQualityAPI] Received conversation flag for session ${session_id}`);

    const investigation = await createConversationQualityInvestigation({
      sessionId: session_id,
      userId: user_id,
      messages,
      flagged_message_index,
      user_note,
    });

    res.json({
      investigation_id: investigation.id,
      status: "created",
      message: "Investigation created successfully. Analysis will be processed asynchronously."
    });
  } catch (error: any) {
    console.error("[ConversationQualityAPI] Error creating investigation:", error);
    res.status(500).json({
      error: "Failed to create conversation quality investigation",
      details: error.message
    });
  }
});

export default router;
