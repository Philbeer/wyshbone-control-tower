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
  artefactId: z.string().optional(),
  goal: z.string().optional(),
  proof_mode: z.string().optional(),
  leads: z.unknown().optional(),
  success_criteria: z
    .object({
      target_count: z.number().int().positive().optional(),
    })
    .passthrough()
    .optional(),
});

function buildProofVerdict(proofMode: string | undefined, runId: string, artefactId: string) {
  let verdict: string;
  let rationale: string;

  if (proofMode === "STOP") {
    verdict = "STOP";
    rationale = "Proof stop";
  } else if (proofMode === "CHANGE_PLAN") {
    verdict = "CHANGE_PLAN";
    rationale = "Proof change plan";
  } else {
    verdict = "ACCEPT";
    rationale = "Proof accept";
  }

  console.log(
    `[TOWER_PROOF] run_id=${runId} artefactId=${artefactId} verdict=${verdict}`
  );

  return {
    verdict,
    rationale,
    confidence: 100,
    requested: 0,
    delivered: 0,
    gaps: [],
  };
}

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

    const { leads, success_criteria, run_id, goal, proof_mode, artefactId } = parsed.data;

    if (goal === "Proof Tower Loop") {
      const result = buildProofVerdict(
        proof_mode,
        run_id ?? "none",
        artefactId ?? "none"
      );
      res.json(result);
      return;
    }

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
