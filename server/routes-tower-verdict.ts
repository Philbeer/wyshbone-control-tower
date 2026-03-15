import express from "express";
import { z } from "zod";
import { judgeLeadsList, judgeLeadsListAsync } from "../src/evaluator/towerVerdict";
import type { Constraint, StopReason, AttributeEvidenceArtefact, IntentNarrative } from "../src/evaluator/towerVerdict";
import { judgePlasticsInjection } from "../src/evaluator/plasticsInjectionRubric";
import type { PlasticsRubricInput, PlasticsStepSnapshot } from "../src/evaluator/plasticsInjectionRubric";
import { evaluateLearningUpdate } from "../src/evaluator/learningUpdateEmitter";
import type { LearningUpdateInput } from "../src/evaluator/learningUpdateEmitter";
import { enrichAttributeEvidence } from "../src/evaluator/semanticEvidenceJudge";
import { fireBehaviourJudge, inferQueryClass, mapSourceTier, buildLeadsEvidence } from "../src/evaluator/behaviourJudge";
import type { ConstraintVerdictDetail } from "../src/evaluator/behaviourJudge";
import { db } from "../src/lib/db";
import { sql, eq } from "drizzle-orm";
import { towerVerdicts } from "../shared/schema";

const router = express.Router();

const TOWER_VERSION = "3.3.0";
const TOWER_MODE = process.env.TOWER_STUB_MODE === "true" ? "stub" : "live";

router.get("/health", (_req, res) => {
  res.json({ ok: true, version: TOWER_VERSION, time: new Date().toISOString(), tower_mode: TOWER_MODE });
});

const constraintSchema = z.object({
  type: z.enum(["NAME_CONTAINS", "NAME_STARTS_WITH", "LOCATION", "COUNT_MIN", "HAS_ATTRIBUTE"]),
  field: z.string(),
  value: z.union([z.string(), z.number()]),
  hardness: z.enum(["hard", "soft"]).optional(),
  evidence_requirement: z.enum(["none", "lead_field", "directory_data", "search_snippet", "website_text", "external_source"]).optional(),
  label: z.string().optional(),
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
  idempotency_key: z.string().optional(),
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
  status: z.enum(["yes", "no", "unknown", "not_attempted", "not_applicable"]),
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
  artefactType: z.enum(["leads_list", "final_delivery"]),
  run_id: z.string().optional(),
  artefactId: z.string().optional(),
  goal: z.string().optional(),
  proof_mode: z.string().optional(),
  idempotency_key: z.string().optional(),

  original_goal: z.string().optional(),
  original_user_goal: z.string().optional(),
  normalized_goal: z.string().optional(),

  leads: z.array(leadSchema).optional(),
  delivered_leads: z.array(leadSchema).optional(),
  constraints: z.array(constraintSchema).optional(),

  requested_count_user: z.number().int().optional(),
  requested_count: z.number().int().optional(),
  accumulated_count: z.number().int().optional(),
  delivered_count: z.number().int().optional(),
  verified_exact: z.number().int().optional(),

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

  verification_policy: z.string().optional(),
  strategy: z.string().optional(),
  agent_clarified: z.boolean().optional(),

  query_shape_key: z.string().optional(),
  steps_count: z.number().int().optional(),
  tool_calls: z.number().int().optional(),
  current_search_budget_pages: z.number().int().optional(),
  current_verification_level: z.enum(["minimal", "standard", "strict"]).optional(),
  current_radius_escalation: z.enum(["conservative", "moderate", "aggressive"]).optional(),
});

interface PersistResult {
  persisted: boolean;
  duplicate: boolean;
  warning_code?: string;
}

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
  idempotency_key?: string | null;
}): Promise<PersistResult> {
  if (row.idempotency_key) {
    try {
      const existing = await db
        .select({ id: towerVerdicts.id })
        .from(towerVerdicts)
        .where(eq(towerVerdicts.idempotency_key, row.idempotency_key))
        .limit(1);

      if (existing.length > 0) {
        console.log(`[TOWER_PERSIST] duplicate idempotency_key=${row.idempotency_key} run_id=${row.run_id} -- skipped`);
        return { persisted: true, duplicate: true };
      }
    } catch (checkErr) {
      console.warn(
        "[TOWER_PERSIST] Idempotency check failed, proceeding with insert:",
        checkErr instanceof Error ? checkErr.message : checkErr
      );
    }
  }

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
      idempotency_key: row.idempotency_key ?? null,
    });
    console.log(`[TOWER_PERSIST] verdict=${row.verdict} run_id=${row.run_id} artefact_type=${row.artefact_type}`);
    return { persisted: true, duplicate: false };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("idx_tower_verdicts_idempotency_key") || errMsg.includes("duplicate key")) {
      console.log(`[TOWER_PERSIST] duplicate key on insert run_id=${row.run_id} -- skipped`);
      return { persisted: true, duplicate: true };
    }
    console.error("[TOWER_PERSIST] Failed to persist tower verdict:", errMsg);
    return { persisted: false, duplicate: false, warning_code: "PERSIST_FAILED" };
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

function addPersistMeta(response: Record<string, any>, pr: PersistResult): Record<string, any> {
  return {
    ...response,
    persisted: pr.persisted,
    duplicate: pr.duplicate,
    ...(pr.warning_code ? { warning_code: pr.warning_code } : {}),
    ...(TOWER_MODE === "stub" ? { tower_mode: "stub" } : {}),
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
      const idempotencyKey = data.idempotency_key ?? null;

      if (data.goal === "Proof Tower Loop") {
        const result = buildProofVerdict(data.proof_mode, runId, artId);
        const pr = await persistTowerVerdict({
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
          idempotency_key: idempotencyKey,
        });
        res.json(addPersistMeta(result, pr));
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

      const pr = await persistTowerVerdict({
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
        idempotency_key: idempotencyKey,
      });

      res.json(addPersistMeta({
        ...result,
        artefactType,
        run_id: data.run_id,
      }, pr));
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
    const idempotencyKey = data.idempotency_key ?? null;

    if (data.goal === "Proof Tower Loop") {
      const result = buildProofVerdict(data.proof_mode, runId, artId);
      const pr = await persistTowerVerdict({
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
        idempotency_key: idempotencyKey,
      });
      res.json(addPersistMeta(result, pr));
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
                attribute_raw: p.attribute_raw,
                constraint_raw: p.constraint_raw,
                verdict: p.verdict,
                confidence: p.confidence ?? 0,
                evidence_id: p.evidence_id,
                source_url: p.source_url,
                quote: p.quote,
                extracted_quotes: Array.isArray(p.extracted_quotes) ? p.extracted_quotes.filter((q: unknown) => typeof q === "string" && q) : undefined,
                page_title: typeof p.page_title === "string" ? p.page_title : undefined,
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

    const goalForSemantic = data.original_goal ?? data.original_user_goal ?? data.normalized_goal ?? "";
    if (attributeEvidenceItems.length > 0 && goalForSemantic) {
      try {
        const constraintsForSemantic = (data.constraints as Constraint[] | undefined) ?? [];
        if (constraintsForSemantic.some(c => c.type === "HAS_ATTRIBUTE")) {
          attributeEvidenceItems = await enrichAttributeEvidence(attributeEvidenceItems, goalForSemantic, constraintsForSemantic);
        }
      } catch (semanticErr) {
        console.error(
          `[Tower][tower-verdict] semantic enrichment failed for run_id=${runId}, falling back to upstream verdicts:`,
          semanticErr instanceof Error ? semanticErr.message : semanticErr
        );
      }
    }

    console.log(
      `[TOWER_IN] final_delivery_payload: run_id=${runId} artefactType=${artefactType} ` +
      `leads=${data.leads?.length ?? "none"} delivered_leads=${(data as any).delivered_leads?.length ?? "none"} ` +
      `delivered_count=${data.delivered_count ?? "none"} verified_exact=${data.verified_exact ?? "none"} ` +
      `accumulated_count=${data.accumulated_count ?? "none"} delivered=${JSON.stringify(data.delivered ?? "none")} ` +
      `requested_count_user=${data.requested_count_user ?? "none"} requested_count=${data.requested_count ?? "none"} ` +
      `verification_summary=${data.verification_summary ? `verified_exact_count=${data.verification_summary.verified_exact_count}` : "none"}`
    );

    const result = await judgeLeadsListAsync({
      leads: data.leads,
      delivered_leads: data.delivered_leads,
      constraints: data.constraints as Constraint[] | undefined,
      requested_count_user: data.requested_count_user,
      requested_count: data.requested_count,
      accumulated_count: data.accumulated_count,
      delivered_count: data.delivered_count,
      verified_exact: data.verified_exact,
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
      verification_policy: data.verification_policy,
      strategy: data.strategy,
      agent_clarified: data.agent_clarified,
      intent_narrative: (data as any).intent_narrative as IntentNarrative | undefined,
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
      `[TOWER_IN] run_id=${runId} verdict=${result.verdict} action=${result.action} requested=${result.requested} delivered=${result.delivered} suggestions=${result.suggested_changes.length} _debug=${JSON.stringify(result._debug ?? "MISSING")}`
    );

    const learningInput: LearningUpdateInput = {
      verdict: result.verdict,
      delivered: result.delivered,
      requested: result.requested,
      gaps: result.gaps,
      confidence: result.confidence,
      stop_reason: result.stop_reason,
      suggested_changes: result.suggested_changes,
      constraint_results: result.constraint_results,
      run_id: runId,
      query_shape_key: data.query_shape_key,
      replans_used: data.meta?.replans_used,
      steps_count: data.steps_count,
      tool_calls: data.tool_calls,
      current_search_budget_pages: data.current_search_budget_pages,
      current_verification_level: data.current_verification_level,
      current_radius_escalation: data.current_radius_escalation,
    };
    const learningUpdate = evaluateLearningUpdate(learningInput);

    const pr = await persistTowerVerdict({
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
      idempotency_key: idempotencyKey,
    });

    if (!pr.duplicate) {
      const goal =
        data.original_goal ?? data.original_user_goal ?? data.normalized_goal ?? "";

      const bjConstraints = (data.constraints ?? []).map((c: any) => ({
        type: c.type as string,
        field: c.field as string,
        value: c.value as string | number,
        hardness: (c.hardness ?? "hard") as "hard" | "soft",
        evidence_requirement: c.evidence_requirement as string | undefined,
      }));

      const bjConstraintVerdicts: ConstraintVerdictDetail[] = (result.constraint_results ?? []).map((cr) => {
        const detail: ConstraintVerdictDetail = {
          type: cr.constraint.type,
          field: cr.constraint.field,
          value: cr.constraint.value,
          hardness: cr.constraint.hardness,
          verdict: cr.constraint_verdict ?? (cr.passed ? "VERIFIED" : "UNSUPPORTED"),
          matched_count: cr.matched_count,
          total_leads: cr.total_leads,
        };
        if (cr.quote) detail.quote = cr.quote;
        if (cr.source_url) {
          detail.source_url = cr.source_url;
        }
        if (cr.attribute_evidence_details && cr.attribute_evidence_details.length > 0) {
          const first = cr.attribute_evidence_details[0];
          if (!detail.quote && first.quote) detail.quote = first.quote;
          if (!detail.source_url && first.source_url) detail.source_url = first.source_url;
        }
        const matchingAttrEv = attributeEvidenceItems.find((ae) =>
          ae.attribute_key === cr.constraint.field || ae.attribute === cr.constraint.field
        );
        if (matchingAttrEv?.source_tier) {
          detail.source_tier = mapSourceTier(matchingAttrEv.source_tier);
        }
        if (matchingAttrEv?.semantic_reasoning) {
          detail.reason = matchingAttrEv.semantic_reasoning;
        }
        return detail;
      });

      const bjLeadsEvidence = buildLeadsEvidence(
        (data.leads ?? []) as Array<{ name: string; [key: string]: unknown }>,
        (data.delivered_leads as Array<{ name: string; [key: string]: unknown }> | undefined),
        attributeEvidenceItems,
      );

      const bjQueryClass = inferQueryClass(goal, bjConstraints);

      const bjIntentNarrative = (data as any).intent_narrative as IntentNarrative | undefined;

      fireBehaviourJudge({
        run_id: runId,
        original_goal: goal,
        strategy: data.strategy ?? null,
        verification_policy: data.verification_policy ?? null,
        delivered_count: result.delivered,
        requested_count: data.requested_count_user ?? data.requested_count ?? null,
        query_class: bjQueryClass,
        constraints: bjConstraints,
        constraint_verdicts: bjConstraintVerdicts,
        leads_evidence: bjLeadsEvidence,
        tower_verdict: result.verdict,
        tower_gaps: result.gaps,
        tower_stop_reason_code: result.stop_reason?.code ?? null,
        agent_clarified: data.agent_clarified ?? false,
        intent_narrative: bjIntentNarrative ? JSON.stringify(bjIntentNarrative) : null,
        entity_exclusions: bjIntentNarrative?.entity_exclusions ?? null,
        key_discriminator: bjIntentNarrative?.key_discriminator ?? null,
      });
    }

    res.json(addPersistMeta({
      ...result,
      ...(learningUpdate ? { learning_update: learningUpdate } : {}),
    }, pr));
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
      persisted: false,
      duplicate: false,
      warning_code: "INTERNAL_ERROR",
    });
  }
});

export default router;
