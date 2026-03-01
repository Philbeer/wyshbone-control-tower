import express from "express";
import { z } from "zod";
import { judgeLeadsList } from "../src/evaluator/towerVerdict";
import type { Constraint, StopReason, AttributeEvidenceArtefact } from "../src/evaluator/towerVerdict";
import { judgePlasticsInjection } from "../src/evaluator/plasticsInjectionRubric";
import type { PlasticsRubricInput, PlasticsStepSnapshot } from "../src/evaluator/plasticsInjectionRubric";
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";
import { towerVerdicts } from "../shared/schema";

const router = express.Router();

const TOWER_VERSION = "3.2.0";

router.get("/health", (_req, res) => {
  res.json({ ok: true, version: TOWER_VERSION, time: new Date().toISOString() });
});

const constraintSchema = z.object({
  type: z.enum(["NAME_CONTAINS", "NAME_STARTS_WITH", "LOCATION", "COUNT_MIN", "HAS_ATTRIBUTE"]),
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
  delivery_summary: z.enum(["PASS", "PARTIAL", "STOP"]).optional(),

  requires_relationship_evidence: z.boolean().optional(),
  verified_relationship_count: z.number().optional(),

  time_predicates: z.array(z.object({
    predicate: z.string(),
    hardness: z.enum(["hard", "soft"]),
  })).optional(),
  time_predicates_mode: z.enum(["verifiable", "proxy", "unverifiable"]).optional(),
  time_predicates_proxy_used: z.enum(["news_mention", "recent_reviews", "new_listing", "social_media_post", "press_release"]).nullable().optional(),
  time_predicates_satisfied_count: z.number().int().optional(),
  time_predicates_unknown_count: z.number().int().optional(),

  unresolved_hard_constraints: z.array(z.object({
    constraint_id: z.string(),
    label: z.string(),
    verifiability: z.enum(["verifiable", "proxy", "unverifiable"]),
    proxy_selected: z.string().nullable().optional(),
    must_be_certain: z.boolean().optional(),
  })).optional(),

  best_effort_accepted: z.boolean().optional(),
});

async function persistTowerVerdict(row: {
  run_id: string;
  artefact_id?: string | null;
  artefact_type: string;
  verdict: string;
  stop_reason?: StopReason | null;
  delivered?: number | null;
  requested?: number | null;
  gaps: string[];
  suggested_changes: any[];
  confidence?: number | null;
  rationale?: string | null;
}): Promise<void> {
  try {
    await db.insert(towerVerdicts).values({
      run_id: row.run_id,
      artefact_id: row.artefact_id ?? null,
      artefact_type: row.artefact_type,
      verdict: row.verdict,
      stop_reason: row.stop_reason ?? null,
      delivered: row.delivered ?? null,
      requested: row.requested ?? null,
      gaps: row.gaps,
      suggested_changes: row.suggested_changes,
      confidence: row.confidence ?? null,
      rationale: row.rationale ?? null,
    });
    console.log(`[TOWER_PERSIST] verdict=${row.verdict} run_id=${row.run_id} artefact_type=${row.artefact_type}`);
  } catch (err) {
    console.error(
      "[TOWER_PERSIST] Failed to persist tower verdict:",
      err instanceof Error ? err.message : err
    );
  }
}

function buildProofVerdict(
  proofMode: string | undefined,
  runId: string,
  artefactId: string
) {
  let verdict: "ACCEPT" | "ACCEPT_WITH_UNVERIFIED" | "CHANGE_PLAN" | "STOP";
  let rationale: string;
  let stopReason: StopReason | undefined;

  if (proofMode === "STOP") {
    verdict = "STOP";
    rationale = "Proof stop";
    stopReason = { code: "PROOF_STOP", message: "Forced STOP via proof_mode" };
  } else if (proofMode === "CHANGE_PLAN") {
    verdict = "CHANGE_PLAN";
    rationale = "Proof change plan";
    stopReason = { code: "PROOF_CHANGE_PLAN", message: "Forced CHANGE_PLAN via proof_mode" };
  } else {
    verdict = "ACCEPT";
    rationale = "Proof accept";
  }

  console.log(
    `[TOWER_PROOF] run_id=${runId} artefactId=${artefactId} verdict=${verdict}`
  );

  return {
    verdict,
    action: (verdict === "ACCEPT" || verdict === "ACCEPT_WITH_UNVERIFIED") ? "continue" as const : verdict === "CHANGE_PLAN" ? "change_plan" as const : "stop" as const,
    rationale,
    confidence: 100,
    requested: 0,
    delivered: 0,
    gaps: [] as string[],
    suggested_changes: [] as any[],
    stop_reason: stopReason,
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
      const runId = data.run_id ?? "none";
      const artId = data.artefactId ?? "none";

      if (data.goal === "Proof Tower Loop") {
        const result = buildProofVerdict(data.proof_mode, runId, artId);
        await persistTowerVerdict({
          run_id: runId,
          artefact_id: artId,
          artefact_type: artefactType,
          verdict: result.verdict,
          stop_reason: result.stop_reason,
          delivered: result.delivered,
          requested: result.requested,
          gaps: result.gaps,
          suggested_changes: result.suggested_changes,
          confidence: result.confidence,
          rationale: result.rationale,
        });
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
        `[TOWER_IN] run_id=${runId} artefactType=${artefactType} verdict=${result.verdict} action=${result.action} scrap_rate=${result.scrap_rate_now} max_scrap=${result.max_scrap_percent} step=${result.step ?? "?"}`
      );

      await persistTowerVerdict({
        run_id: runId,
        artefact_id: artId,
        artefact_type: artefactType,
        verdict: result.verdict,
        stop_reason: result.stop_reason,
        delivered: null,
        requested: null,
        gaps: result.gaps,
        suggested_changes: result.suggested_changes.map(s => ({ type: "CHANGE_QUERY", reason: s })),
        confidence: result.confidence,
        rationale: result.reason,
      });

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
    const runId = data.run_id ?? "none";
    const artId = data.artefactId ?? "none";

    if (data.goal === "Proof Tower Loop") {
      const result = buildProofVerdict(data.proof_mode, runId, artId);
      await persistTowerVerdict({
        run_id: runId,
        artefact_id: artId,
        artefact_type: "leads_list",
        verdict: result.verdict,
        stop_reason: result.stop_reason,
        delivered: result.delivered,
        requested: result.requested,
        gaps: result.gaps,
        suggested_changes: result.suggested_changes,
        confidence: result.confidence,
        rationale: result.rationale,
      });
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

    let attributeEvidenceItems: AttributeEvidenceArtefact[] = [];
    if (runId && runId !== "none") {
      try {
        const attrEvResult = await db.execute(
          sql`SELECT payload_json FROM artefacts
              WHERE run_id = ${runId}
                AND artefact_type = 'attribute_evidence'
              ORDER BY created_at DESC`
        );
        if (attrEvResult.rows && attrEvResult.rows.length > 0) {
          for (const row of attrEvResult.rows) {
            let p: any = null;
            try {
              p = typeof row.payload_json === "string"
                ? JSON.parse(row.payload_json)
                : row.payload_json;
            } catch {}
            if (p && p.lead_name && (p.attribute || p.attribute_key) && p.verdict) {
              attributeEvidenceItems.push({
                lead_name: p.lead_name,
                lead_place_id: p.lead_place_id ?? p.placeId ?? p.place_id,
                attribute: p.attribute ?? p.attribute_key,
                attribute_key: p.attribute_key,
                verdict: p.verdict,
                confidence: p.confidence ?? 0,
                evidence_id: p.evidence_id,
                source_url: p.source_url,
                quote: p.quote,
              });
            }
          }
          console.log(
            `[Tower][tower-verdict] Found ${attributeEvidenceItems.length} attribute_evidence artefact(s) for run_id=${runId}`
          );
          if (process.env.DEBUG_TOWER_ATTR_TRACE === "true") {
            console.log(`[TOWER][ATTR_TRACE] === attribute_evidence artefacts from DB (tower-verdict) ===`);
            console.log(`[TOWER][ATTR_TRACE] raw rows returned: ${attrEvResult.rows.length}`);
            for (const item of attributeEvidenceItems) {
              console.log(`[TOWER][ATTR_TRACE] db_artefact: lead_name="${item.lead_name}" lead_place_id="${item.lead_place_id ?? "none"}" attribute="${item.attribute}" attribute_key="${item.attribute_key ?? "none"}" verdict=${item.verdict} confidence=${item.confidence} evidence_id=${item.evidence_id ?? "none"} source_url=${item.source_url ?? "none"} quote="${(item.quote ?? "none").substring(0, 100)}"`);
            }
          }
        }
      } catch (attrEvErr) {
        console.error(
          `[Tower][tower-verdict] attribute_evidence lookup failed for run_id=${runId}:`,
          attrEvErr instanceof Error ? attrEvErr.message : attrEvErr
        );
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
      delivery_summary: data.delivery_summary,
      attribute_evidence: attributeEvidenceItems.length > 0 ? attributeEvidenceItems : undefined,
      requires_relationship_evidence: data.requires_relationship_evidence,
      verified_relationship_count: data.verified_relationship_count,
      time_predicates: data.time_predicates,
      time_predicates_mode: data.time_predicates_mode,
      time_predicates_proxy_used: data.time_predicates_proxy_used,
      time_predicates_satisfied_count: data.time_predicates_satisfied_count,
      time_predicates_unknown_count: data.time_predicates_unknown_count,
      unresolved_hard_constraints: data.unresolved_hard_constraints,
      best_effort_accepted: data.best_effort_accepted,
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
      `[TOWER_IN] run_id=${runId} verdict=${result.verdict} action=${result.action} requested=${result.requested} delivered=${result.delivered} suggestions=${result.suggested_changes.length}`
    );

    await persistTowerVerdict({
      run_id: runId,
      artefact_id: artId,
      artefact_type: "leads_list",
      verdict: result.verdict,
      stop_reason: result.stop_reason,
      delivered: result.delivered,
      requested: result.requested,
      gaps: result.gaps,
      suggested_changes: result.suggested_changes,
      confidence: result.confidence,
      rationale: result.rationale,
    });

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
      gaps: ["INTERNAL_ERROR"],
      confidence: 0,
      rationale: "Internal server error during verdict evaluation.",
      suggested_changes: [],
      stop_reason: {
        code: "INTERNAL_ERROR",
        message: "Internal server error during verdict evaluation.",
      },
    });
  }
});

export default router;
