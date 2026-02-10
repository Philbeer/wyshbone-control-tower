import express from "express";
import { z } from "zod";
import { judgeLeadsList } from "../src/evaluator/towerVerdict";

const router = express.Router();

const TOWER_VERSION = "1.0.0";

router.get("/health", (_req, res) => {
  res.json({ ok: true, version: TOWER_VERSION, time: new Date().toISOString() });
});

const towerVerdictRequestSchema = z.object({
  artefactType: z.literal("leads_list"),
  run_id: z.string().optional(),
  leads: z.unknown().optional(),
  success_criteria: z
    .object({
      target_count: z.number().int().positive().optional(),
    })
    .passthrough()
    .optional(),
});

router.post("/tower-verdict", async (req, res) => {
  try {
    const parsed = towerVerdictRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ error: "Validation failed", details: issues });
      return;
    }

    const { leads, success_criteria, run_id } = parsed.data;

    const result = judgeLeadsList({ leads, success_criteria });

    console.log(
      `[TOWER_IN] run_id=${run_id ?? "none"} verdict=${result.verdict} requested=${result.requested} delivered=${result.delivered}`
    );

    res.json(result);
  } catch (err) {
    console.error(
      "[TOWER] Unexpected error in tower-verdict:",
      err instanceof Error ? err.message : err
    );
    res.status(500).json({
      verdict: "STOP",
      delivered: 0,
      requested: 0,
      gaps: ["internal_error"],
      confidence: 0,
      rationale: "Internal server error during verdict evaluation.",
    });
  }
});

export default router;
