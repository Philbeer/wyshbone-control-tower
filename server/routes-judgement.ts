import express from "express";
import { judgementRequestSchema } from "../shared/schema";
import { evaluate } from "../src/evaluator/judgement";

const router = express.Router();

router.post("/evaluate", (req, res) => {
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

    const { success, snapshot } = parsed.data;
    const result = evaluate(success, snapshot);

    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

export default router;
