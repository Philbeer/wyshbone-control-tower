import express from "express";
import { z } from "zod";
import { judgeLeadsList } from "../src/evaluator/towerVerdict";

const router = express.Router();

const TOWER_VERSION = "1.0.0";

router.get("/health", (_req, res) => {
  res.json({ ok: true, version: TOWER_VERSION, time: new Date().toISOString() });
});

const constraintSpecSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  hardness: z.enum(["hard", "soft"]),
  was_relaxed: z.boolean().optional(),
}).passthrough();

const attemptHistoryEntrySchema = z.object({
  plan_version: z.number(),
  radius_km: z.number(),
  delivered_count: z.number(),
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
  constraints: z.union([
    z.record(constraintSpecSchema),
    z.object({
      count: z.number().int().positive().optional(),
      prefix: z.string().optional(),
      prefix_filter: z.string().optional(),
      location: z.string().optional(),
      radius: z.union([z.number(), z.string()]).optional(),
      business_type: z.string().optional(),
    }).passthrough(),
  ]).optional(),
  hard_constraints: z.array(z.string()).optional(),
  soft_constraints: z.array(z.string()).optional(),
  requested_count_user: z.number().int().optional(),
  requested_count: z.number().int().optional(),
  accumulated_count: z.number().int().optional(),
  delivered_count: z.number().int().optional(),
  delivered: z.number().int().optional(),
  original_user_goal: z.string().optional(),
  normalized_goal: z.string().optional(),
  plan: z.unknown().optional(),
  plan_summary: z.unknown().optional(),
  plan_version: z.number().optional(),
  radius_km: z.number().optional(),
  attempt_history: z.array(attemptHistoryEntrySchema).optional(),
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
    suggested_changes: [],
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

    const {
      leads,
      success_criteria,
      constraints,
      hard_constraints,
      soft_constraints,
      requested_count_user,
      requested_count,
      accumulated_count,
      delivered_count,
      delivered,
      original_user_goal,
      normalized_goal,
      plan,
      plan_summary,
      plan_version,
      radius_km,
      attempt_history,
      run_id,
      goal,
      proof_mode,
      artefactId,
    } = parsed.data;

    if (goal === "Proof Tower Loop") {
      const result = buildProofVerdict(
        proof_mode,
        run_id ?? "none",
        artefactId ?? "none"
      );
      res.json(result);
      return;
    }

    const result = judgeLeadsList({
      leads,
      success_criteria,
      constraints: constraints as any,
      hard_constraints,
      soft_constraints,
      requested_count_user,
      requested_count,
      accumulated_count,
      delivered_count,
      delivered,
      original_user_goal,
      normalized_goal,
      plan,
      plan_summary,
      plan_version,
      radius_km,
      attempt_history,
    });

    console.log(
      `[TOWER_IN] run_id=${run_id ?? "none"} verdict=${result.verdict} requested=${result.requested} delivered=${result.delivered} suggestions=${result.suggested_changes.length}`
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
      suggested_changes: [],
    });
  }
});

export default router;
