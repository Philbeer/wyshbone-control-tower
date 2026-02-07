import express from "express";
import { judgementRequestSchema, judgementEvaluations } from "../shared/schema";
import { evaluate } from "../src/evaluator/judgement";
import { db } from "../src/lib/db";

const router = express.Router();

router.post("/evaluate", async (req, res) => {
  try {
    const parsed = judgementRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({
        error: "Validation failed",
        details: issues,
      });
      return;
    }

    const { run_id, mission_type, success, snapshot } = parsed.data;
    const result = evaluate(success, snapshot);

    try {
      await db.insert(judgementEvaluations).values({
        run_id,
        mission_type,
        verdict: result.verdict,
        reason_code: result.reason_code,
        explanation: result.explanation,
        success_criteria: success,
        snapshot,
        strategy: result.strategy ?? null,
        evaluated_at: new Date(result.evaluated_at),
      });
    } catch (dbErr) {
      console.warn("Failed to persist judgement evaluation:", dbErr instanceof Error ? dbErr.message : dbErr);
    }

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

export default router;
