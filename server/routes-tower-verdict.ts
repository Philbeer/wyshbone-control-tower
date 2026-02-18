import express from "express";
import { z } from "zod";
import { judgeLeadsList } from "../src/evaluator/towerVerdict";
import type { Constraint } from "../src/evaluator/towerVerdict";
import { judgePlasticsInjection } from "../src/evaluator/plasticsInjectionRubric";
import type { PlasticsRubricInput, PlasticsStepSnapshot } from "../src/evaluator/plasticsInjectionRubric";

const router = express.Router();

const TOWER_VERSION = "3.1.0";

router.get("/health", (_req, res) => {
  res.json({ ok: true, version: TOWER_VERSION, time: new Date().toISOString() });
});

const constraintSchema = z.object({
  type: z.enum(["NAME_CONTAINS", "NAME_STARTS_WITH", "LOCATION", "COUNT_MIN"]),
  field: z.string(),
  value: z.union([z.string(), z.number()]),
  hardness: z.enum(["hard", "soft"]).optional(),
});

const leadSchema = z
  .object({
    name: z.string(),
    address: z.string().optional(),
  })
  .passthrough();

const attemptHistoryEntrySchema = z.object({
  plan_version: z.number(),
  radius_km: z.number(),
  delivered_count: z.number(),
});

const deliveredSchema = z
  .object({
    delivered_matching_accumulated: z.number().optional(),
    delivered_matching_this_plan: z.number().optional(),
    delivered_total_accumulated: z.number().optional(),
    delivered_total_this_plan: z.number().optional(),
  })
  .passthrough();

const metaSchema = z
  .object({
    plan_version: z.number().optional(),
    replans_used: z.number().optional(),
    max_replans: z.number().optional(),
    radius_km: z.number().optional(),
    relaxed_constraints: z.array(z.string()).optional(),
  })
  .passthrough();

const successCriteriaSchema = z
  .object({
    requested_count_user: z.number().int().optional(),
    target_count: z.number().int().positive().optional(),
    hard_constraints: z
      .array(
        z
          .object({ type: z.string(), field: z.string(), value: z.any().optional() })
          .passthrough()
      )
      .optional(),
    soft_constraints: z
      .array(
        z
          .object({ type: z.string(), field: z.string(), value: z.any().optional() })
          .passthrough()
      )
      .optional(),
    allow_relax_soft_constraints: z.boolean().optional(),
  })
  .passthrough();

const plasticsConstraintsSchema = z.object({
  max_scrap_percent: z.number(),
  max_energy_kwh_per_good_part: z.number().optional(),
  deadline_step: z.number().int().optional(),
});

const defectTypeSchema = z.union([z.string(), z.array(z.string())]).optional();

const plasticsFactoryStateSchema = z.object({
  scrap_rate_now: z.number(),
  achievable_scrap_floor: z.number().optional(),
  defect_type: defectTypeSchema,
  energy_kwh_per_good_part: z.number().optional(),
  moisture_level: z.number().optional(),
  tool_condition: z.string().optional(),
  machine: z.string().optional(),
  step: z.number().int().optional(),
});

const plasticsFactoryDecisionSchema = z.object({
  action: z.string(),
  parameters: z.record(z.unknown()).optional(),
});

const plasticsStepSnapshotSchema = z.object({
  step: z.number().int(),
  scrap_rate: z.number(),
  defect_type: defectTypeSchema,
  energy_kwh_per_good_part: z.number().optional(),
  decision_action: z.string().optional(),
  machine: z.string().optional(),
});

const plasticsVerdictRequestSchema = z.object({
  artefactType: z.enum(["factory_state", "factory_decision"]),
  run_id: z.string().optional(),
  artefactId: z.string().optional(),
  goal: z.string().optional(),
  proof_mode: z.string().optional(),
  constraints: plasticsConstraintsSchema,
  factory_state: plasticsFactoryStateSchema,
  factory_decision: plasticsFactoryDecisionSchema.optional(),
  history: z.array(plasticsStepSnapshotSchema).optional(),
});

const cvlConstraintResultSchema = z.object({
  constraint_id: z.string().optional(),
  type: z.string(),
  field: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  status: z.enum(["yes", "no", "unknown"]),
  reason: z.string().optional(),
});

const verificationSummarySchema = z.object({
  verified_exact_count: z.number(),
  constraint_results: z.array(cvlConstraintResultSchema).optional(),
});

const constraintsExtractedSchema = z.object({
  requested_count_user: z.number().int().optional(),
  constraints: z.array(constraintSchema).optional(),
});

const towerVerdictRequestSchema = z.object({
  artefactType: z.literal("leads_list"),
  run_id: z.string().optional(),
  artefactId: z.string().optional(),
  goal: z.string().optional(),
  proof_mode: z.string().optional(),

  original_goal: z.string().optional(),
  original_user_goal: z.string().optional(),
  normalized_goal: z.string().optional(),

  leads: z.array(leadSchema).optional(),
  constraints: z.array(constraintSchema).optional(),

  requested_count_user: z.number().int().optional(),
  requested_count: z.number().int().optional(),
  accumulated_count: z.number().int().optional(),
  delivered_count: z.number().int().optional(),

  delivered: z.union([deliveredSchema, z.number().int()]).optional(),

  success_criteria: successCriteriaSchema.optional(),
  meta: metaSchema.optional(),

  plan: z.unknown().optional(),
  plan_summary: z.unknown().optional(),
  plan_version: z.number().optional(),
  radius_km: z.number().optional(),
  attempt_history: z.array(attemptHistoryEntrySchema).optional(),

  hard_constraints: z.array(z.string()).optional(),
  soft_constraints: z.array(z.string()).optional(),

  artefact_title: z.string().optional(),
  artefact_summary: z.string().optional(),

  verification_summary: verificationSummarySchema.optional(),
  constraints_extracted: constraintsExtractedSchema.optional(),
});

function buildProofVerdict(
  proofMode: string | undefined,
  runId: string,
  artefactId: string
) {
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
    action: verdict === "ACCEPT" ? "continue" : verdict === "CHANGE_PLAN" ? "change_plan" : "stop",
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
    const artefactType = req.body?.artefactType;

    if (artefactType === "factory_state" || artefactType === "factory_decision") {
      const parsed = plasticsVerdictRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        const issues = parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        }));
        res.status(400).json({ error: "Validation failed", details: issues });
        return;
      }

      const data = parsed.data;

      if (data.goal === "Proof Tower Loop") {
        const result = buildProofVerdict(
          data.proof_mode,
          data.run_id ?? "none",
          data.artefactId ?? "none"
        );
        res.json(result);
        return;
      }

      const rubricInput: PlasticsRubricInput = {
        constraints: data.constraints,
        factory_state: data.factory_state,
        factory_decision: data.factory_decision,
        history: data.history as PlasticsStepSnapshot[] | undefined,
      };

      const result = judgePlasticsInjection(rubricInput);

      console.log(
        `[TOWER_IN] run_id=${data.run_id ?? "none"} artefactType=${artefactType} verdict=${result.verdict} action=${result.action} scrap_rate=${result.scrap_rate_now} max_scrap=${result.max_scrap_percent} step=${result.step ?? "?"}`
      );

      res.json({
        ...result,
        artefactType,
        run_id: data.run_id,
      });
      return;
    }

    const parsed = towerVerdictRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ error: "Validation failed", details: issues });
      return;
    }

    const data = parsed.data;

    if (data.goal === "Proof Tower Loop") {
      const result = buildProofVerdict(
        data.proof_mode,
        data.run_id ?? "none",
        data.artefactId ?? "none"
      );
      res.json(result);
      return;
    }

    const DEBUG = process.env.DEBUG_TOWER_CONSTRAINTS === "true";

    if (DEBUG) {
      console.log(`[Tower][DEBUG][tower-verdict] raw input.constraints exists=${Array.isArray(data.constraints)} length=${Array.isArray(data.constraints) ? data.constraints.length : 0}`);
      console.log(`[Tower][DEBUG][tower-verdict] raw hard_constraints exists=${Array.isArray(data.hard_constraints)} length=${Array.isArray(data.hard_constraints) ? data.hard_constraints.length : 0}`);
      console.log(`[Tower][DEBUG][tower-verdict] raw soft_constraints exists=${Array.isArray(data.soft_constraints)} length=${Array.isArray(data.soft_constraints) ? data.soft_constraints.length : 0}`);
      if (data.success_criteria) {
        console.log(`[Tower][DEBUG][tower-verdict] success_criteria.hard_constraints exists=${Array.isArray(data.success_criteria.hard_constraints)} length=${Array.isArray(data.success_criteria.hard_constraints) ? data.success_criteria.hard_constraints.length : 0}`);
        console.log(`[Tower][DEBUG][tower-verdict] success_criteria.soft_constraints exists=${Array.isArray(data.success_criteria.soft_constraints)} length=${Array.isArray(data.success_criteria.soft_constraints) ? data.success_criteria.soft_constraints.length : 0}`);
      }
    }

    const result = judgeLeadsList({
      leads: data.leads,
      constraints: data.constraints as Constraint[] | undefined,
      requested_count_user: data.requested_count_user,
      requested_count: data.requested_count,
      accumulated_count: data.accumulated_count,
      delivered_count: data.delivered_count,
      delivered: data.delivered,
      original_goal: data.original_goal,
      original_user_goal: data.original_user_goal,
      normalized_goal: data.normalized_goal,
      success_criteria: data.success_criteria,
      meta: data.meta,
      plan: data.plan,
      plan_summary: data.plan_summary,
      plan_version: data.plan_version,
      radius_km: data.radius_km,
      attempt_history: data.attempt_history,
      hard_constraints: data.hard_constraints,
      soft_constraints: data.soft_constraints,
      artefact_title: data.artefact_title,
      artefact_summary: data.artefact_summary,
      verification_summary: data.verification_summary,
      constraints_extracted: data.constraints_extracted as any,
    });

    if (DEBUG) {
      console.log(`[Tower][DEBUG][tower-verdict] after judgeLeadsList: verdict=${result.verdict} action=${result.action} delivered=${result.delivered} requested=${result.requested} constraint_results=${result.constraint_results?.length ?? 0} suggestions=${result.suggested_changes.length}`);
      if (result.constraint_results && result.constraint_results.length > 0) {
        console.log(`[Tower][DEBUG][tower-verdict] constraint_results preview=${JSON.stringify(result.constraint_results.slice(0, 2).map((r) => ({ type: r.constraint.type, hardness: r.constraint.hardness, matched: r.matched_count, passed: r.passed })))}`);
      }
      if (result.suggested_changes.length > 0) {
        console.log(`[Tower][DEBUG][tower-verdict] suggestions preview=${JSON.stringify(result.suggested_changes.slice(0, 2).map((s) => ({ type: s.type, field: s.field })))}`);
      }
    }

    console.log(
      `[TOWER_IN] run_id=${data.run_id ?? "none"} verdict=${result.verdict} action=${result.action} requested=${result.requested} delivered=${result.delivered} suggestions=${result.suggested_changes.length}`
    );

    res.json(result);
  } catch (err) {
    console.error(
      "[TOWER] Unexpected error in tower-verdict:",
      err instanceof Error ? err.message : err
    );
    res.status(500).json({
      verdict: "STOP",
      action: "stop",
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
