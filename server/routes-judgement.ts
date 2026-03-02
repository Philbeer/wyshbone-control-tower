import express from "express";
import { judgementRequestSchema, judgementEvaluations } from "../shared/schema";
import { evaluate } from "../src/evaluator/judgement";
import { db } from "../src/lib/db";
import { eq } from "drizzle-orm";

const router = express.Router();

const TOWER_MODE = process.env.TOWER_STUB_MODE === "true" ? "stub" : "live";

router.post("/evaluate", async (req, res) => {
  try {
    const idempotencyKey: string | undefined = req.body?.idempotency_key;

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

    let persisted = false;
    let warning_code: string | undefined;
    let duplicate = false;

    if (idempotencyKey) {
      try {
        const existing = await db
          .select({ id: judgementEvaluations.id })
          .from(judgementEvaluations)
          .where(eq(judgementEvaluations.idempotency_key, idempotencyKey))
          .limit(1);

        if (existing.length > 0) {
          persisted = true;
          duplicate = true;
        }
      } catch (checkErr) {
        console.warn(
          "[JUDGEMENT] Idempotency check failed, proceeding with insert:",
          checkErr instanceof Error ? checkErr.message : checkErr
        );
      }
    }

    if (!duplicate) {
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
          idempotency_key: idempotencyKey ?? null,
          evaluated_at: new Date(result.evaluated_at),
        });
        persisted = true;
      } catch (dbErr) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        if (errMsg.includes("idx_judgement_evaluations_idempotency_key") || errMsg.includes("duplicate key")) {
          persisted = true;
          duplicate = true;
        } else {
          warning_code = "PERSIST_FAILED";
          console.error("[JUDGEMENT] Failed to persist judgement evaluation:", errMsg);
        }
      }
    }

    res.json({
      ...result,
      persisted,
      duplicate,
      ...(warning_code ? { warning_code } : {}),
      ...(TOWER_MODE === "stub" ? { tower_mode: "stub" } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    res.status(500).json({ error: message });
  }
});

export default router;
