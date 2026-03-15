import express from "express";
import { db } from "../src/lib/db";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { judgeLeadsList, judgeLeadsListAsync, normalizeConstraintHardness, normalizeStructuredConstraints, judgeAskLeadQuestion } from "../src/evaluator/towerVerdict";
import type { Lead, Constraint, DeliveredInfo, MetaInfo, StructuredConstraint, StopReason, AskLeadQuestionInput, AttributeEvidenceArtefact, IntentNarrative, RejectedLead } from "../src/evaluator/towerVerdict";
import { judgePlasticsInjection } from "../src/evaluator/plasticsInjectionRubric";
import { judgeRunReceipt } from "../src/evaluator/receiptTruthJudge";
import type { SiblingArtefact } from "../src/evaluator/receiptTruthJudge";
import type { PlasticsRubricInput } from "../src/evaluator/plasticsInjectionRubric";
import { evaluateLearningUpdate } from "../src/evaluator/learningUpdateEmitter";
import type { LearningUpdateInput } from "../src/evaluator/learningUpdateEmitter";
import { enrichAttributeEvidence } from "../src/evaluator/semanticEvidenceJudge";
import { fireBehaviourJudge, inferQueryClass, mapSourceTier, buildLeadsEvidence } from "../src/evaluator/behaviourJudge";
import type { ConstraintVerdictDetail } from "../src/evaluator/behaviourJudge";
import { towerVerdicts } from "../shared/schema";

const router = express.Router();

const TOWER_MODE = process.env.TOWER_STUB_MODE === "true" ? "stub" : "live";

const judgeArtefactRequestSchema = z.object({
  runId: z.string().min(1),
  artefactId: z.string().min(1),
  goal: z.string().min(1),
  successCriteria: z.any().optional(),
  artefactType: z.string().min(1),
  proof_mode: z.string().optional(),
  idempotency_key: z.string().optional(),
  query_shape_key: z.string().optional(),
  steps_count: z.number().int().optional(),
  tool_calls: z.number().int().optional(),
  current_search_budget_pages: z.number().int().optional(),
  current_verification_level: z.enum(["minimal", "standard", "strict"]).optional(),
  current_radius_escalation: z.enum(["conservative", "moderate", "aggressive"]).optional(),
});

interface JudgeArtefactResponse {
  verdict: "pass" | "fail";
  action: "continue" | "stop" | "retry" | "change_plan";
  towerVerdict: "ACCEPT" | "CHANGE_PLAN" | "STOP";
  stop_reason?: StopReason | null;
  reasons: string[];
  metrics: Record<string, unknown>;
  suggested_changes: Array<{
    type: string;
    field: string;
    from: string | number | null;
    to: string | number | null;
    reason: string;
  }>;
  rejected_leads?: RejectedLead[];
}

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
        console.log(`[TOWER_PERSIST] duplicate idempotency_key=${row.idempotency_key} run_id=${row.run_id} via=judge-artefact -- skipped`);
        return { persisted: true, duplicate: true };
      }
    } catch (checkErr) {
      console.warn(
        "[TOWER_PERSIST] Idempotency check failed (judge-artefact), proceeding with insert:",
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
    console.log(`[TOWER_PERSIST] verdict=${row.verdict} run_id=${row.run_id} artefact_type=${row.artefact_type} via=judge-artefact`);
    return { persisted: true, duplicate: false };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("idx_tower_verdicts_idempotency_key") || errMsg.includes("duplicate key")) {
      console.log(`[TOWER_PERSIST] duplicate key on insert run_id=${row.run_id} via=judge-artefact -- skipped`);
      return { persisted: true, duplicate: true };
    }
    console.error("[TOWER_PERSIST] Failed to persist tower verdict (judge-artefact):", errMsg);
    return { persisted: false, duplicate: false, warning_code: "PERSIST_FAILED" };
  }
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

function buildProofVerdict(
  proofMode: string | undefined
): { towerVerdict: "ACCEPT" | "CHANGE_PLAN" | "STOP"; rationale: string; stopReason?: StopReason } {
  if (proofMode === "STOP") {
    return {
      towerVerdict: "STOP",
      rationale: "Proof stop",
      stopReason: { code: "PROOF_STOP", message: "Forced STOP via proof_mode" },
    };
  } else if (proofMode === "CHANGE_PLAN") {
    return {
      towerVerdict: "CHANGE_PLAN",
      rationale: "Proof change plan",
      stopReason: { code: "PROOF_CHANGE_PLAN", message: "Forced CHANGE_PLAN via proof_mode" },
    };
  }
  return { towerVerdict: "ACCEPT", rationale: "Proof accept" };
}

function towerVerdictToPassFail(v: "ACCEPT" | "ACCEPT_WITH_UNVERIFIED" | "CHANGE_PLAN" | "STOP"): { verdict: "pass" | "fail"; action: "continue" | "stop" | "change_plan" } {
  if (v === "ACCEPT" || v === "ACCEPT_WITH_UNVERIFIED") return { verdict: "pass", action: "continue" }; // PHASE_5: ACCEPT_WITH_UNVERIFIED maps to pass/continue
  if (v === "CHANGE_PLAN") return { verdict: "fail", action: "change_plan" };
  return { verdict: "fail", action: "stop" };
}

async function judgeLeadsListArtefact(
  payloadJson: any,
  successCriteria: any,
  goal: string,
  artefactTitle?: string,
  artefactSummary?: string,
  attributeEvidence?: AttributeEvidenceArtefact[]
): Promise<JudgeArtefactResponse> {
  const leads: Lead[] = Array.isArray(payloadJson?.leads)
    ? payloadJson.leads.filter((l: any) => l && typeof l.name === "string")
    : [];

  const DEBUG = process.env.DEBUG_TOWER_CONSTRAINTS === "true";

  const rawConstraints = payloadJson?.constraints;
  const rawStructuredConstraints: StructuredConstraint[] | undefined = Array.isArray(payloadJson?.structured_constraints) ? payloadJson.structured_constraints : undefined;
  const rawHardConstraints = payloadJson?.hard_constraints ?? successCriteria?.hard_constraints;
  const rawSoftConstraints = payloadJson?.soft_constraints ?? successCriteria?.soft_constraints;

  let constraints: Constraint[] = [];
  if (Array.isArray(rawConstraints) && rawConstraints.length > 0) {
    constraints = rawConstraints
      .map((c: any) => normalizeConstraintHardness(c))
      .filter((c: Constraint | null): c is Constraint => c !== null);
  }
  if (constraints.length === 0 && rawStructuredConstraints && rawStructuredConstraints.length > 0) {
    constraints = normalizeStructuredConstraints(rawStructuredConstraints);
  }

  if (DEBUG) {
    console.log(`[Tower][DEBUG] raw input.constraints exists=${Array.isArray(rawConstraints)} length=${Array.isArray(rawConstraints) ? rawConstraints.length : 0}`);
    console.log(`[Tower][DEBUG] raw structured_constraints exists=${!!rawStructuredConstraints} length=${rawStructuredConstraints?.length ?? 0}`);
    console.log(`[Tower][DEBUG] raw hard_constraints exists=${Array.isArray(rawHardConstraints)} length=${Array.isArray(rawHardConstraints) ? rawHardConstraints.length : 0}`);
    console.log(`[Tower][DEBUG] raw soft_constraints exists=${Array.isArray(rawSoftConstraints)} length=${Array.isArray(rawSoftConstraints) ? rawSoftConstraints.length : 0}`);
    console.log(`[Tower][DEBUG] after normalization: typed constraints length=${constraints.length} preview=${JSON.stringify(constraints.slice(0, 3).map((c) => ({ type: c.type, field: c.field, hardness: c.hardness, value: c.value })))}`);
  }

  function toFiniteNumber(v: unknown): number | undefined {
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string") { const n = Number(v); if (isFinite(n)) return n; }
    return undefined;
  }

  const rawRequestedCountUser =
    successCriteria?.requested_count_user ?? payloadJson?.requested_count_user;
  const userCountImplicit =
    rawRequestedCountUser === "implicit" || rawRequestedCountUser === "none";

  const requestedCountUser =
    toFiniteNumber(successCriteria?.requested_count_user) ??
    toFiniteNumber(payloadJson?.requested_count_user) ??
    undefined;

  const requestedCount =
    toFiniteNumber(successCriteria?.requested_count) ??
    toFiniteNumber(payloadJson?.requested_count) ??
    undefined;

  const targetCount = userCountImplicit
    ? undefined
    : toFiniteNumber(successCriteria?.target_count) ??
      toFiniteNumber(payloadJson?.success_criteria?.target_count) ??
      undefined;

  const deliveredObj: DeliveredInfo | number | undefined = (() => {
    if (payloadJson?.delivered && typeof payloadJson.delivered === "object") {
      return payloadJson.delivered as DeliveredInfo;
    }
    if (typeof payloadJson?.delivered === "number") {
      return payloadJson.delivered as number;
    }
    const dma =
      successCriteria?.delivered_matching_accumulated ??
      payloadJson?.delivered_matching_accumulated;
    if (dma != null) {
      return { delivered_matching_accumulated: dma } as DeliveredInfo;
    }
    const dc =
      successCriteria?.delivered_count ?? payloadJson?.delivered_count;
    if (dc != null) return dc as number;
    return undefined;
  })();

  const meta: MetaInfo | undefined = payloadJson?.meta ?? (() => {
    const m: MetaInfo = {};
    if (payloadJson?.plan_version != null) m.plan_version = payloadJson.plan_version;
    if (payloadJson?.radius_km != null) m.radius_km = payloadJson.radius_km;
    if (payloadJson?.replans_used != null) m.replans_used = payloadJson.replans_used;
    if (payloadJson?.max_replans != null) m.max_replans = payloadJson.max_replans;
    if (Array.isArray(payloadJson?.relaxed_constraints))
      m.relaxed_constraints = payloadJson.relaxed_constraints;
    return Object.keys(m).length > 0 ? m : undefined;
  })();

  const resolvedSuccessCriteria: any = {};
  if (targetCount != null) resolvedSuccessCriteria.target_count = targetCount;
  if (requestedCountUser != null) resolvedSuccessCriteria.requested_count_user = requestedCountUser;
  if (successCriteria?.allow_relax_soft_constraints != null)
    resolvedSuccessCriteria.allow_relax_soft_constraints = successCriteria.allow_relax_soft_constraints;
  if (successCriteria?.hard_constraints)
    resolvedSuccessCriteria.hard_constraints = successCriteria.hard_constraints;
  if (successCriteria?.soft_constraints)
    resolvedSuccessCriteria.soft_constraints = successCriteria.soft_constraints;

  const attemptHistory = Array.isArray(payloadJson?.attempt_history)
    ? payloadJson.attempt_history
    : undefined;

  const legacyHard: string[] | undefined = Array.isArray(rawHardConstraints) ? rawHardConstraints : undefined;
  const legacySoft: string[] | undefined = Array.isArray(rawSoftConstraints) ? rawSoftConstraints : undefined;

  console.log(
    `[Tower][judge-artefact] leads_list resolution: leads=${leads.length} constraints=${constraints.length} requestedCountUser=${requestedCountUser} requestedCount=${requestedCount} delivered=${JSON.stringify(deliveredObj)}`
  );

  const towerResult = await judgeLeadsListAsync({
    leads,
    delivered_leads: Array.isArray(payloadJson?.delivered_leads) ? payloadJson.delivered_leads : undefined,
    constraints,
    requested_count_user: requestedCountUser,
    requested_count: requestedCount,
    delivered: deliveredObj,
    delivered_count: payloadJson?.delivered_count ?? successCriteria?.delivered_count,
    accumulated_count: payloadJson?.accumulated_count ?? successCriteria?.accumulated_count,
    verified_exact: typeof payloadJson?.verified_exact === "number" ? payloadJson.verified_exact : undefined,
    original_goal: goal,
    success_criteria:
      Object.keys(resolvedSuccessCriteria).length > 0
        ? resolvedSuccessCriteria
        : undefined,
    meta,
    plan: payloadJson?.plan,
    plan_summary: payloadJson?.plan_summary,
    plan_version: payloadJson?.plan_version,
    radius_km: payloadJson?.radius_km,
    attempt_history: attemptHistory,
    hard_constraints: legacyHard,
    soft_constraints: legacySoft,
    artefact_title: artefactTitle,
    artefact_summary: artefactSummary,
    verification_summary: payloadJson?.verification_summary,
    constraints_extracted: payloadJson?.constraints_extracted,
    attribute_evidence: attributeEvidence,
    requires_relationship_evidence: payloadJson?.requires_relationship_evidence,
    verified_relationship_count: payloadJson?.verified_relationship_count,
    verification_policy: payloadJson?.verification_policy ?? undefined,
    strategy: payloadJson?.strategy ?? undefined,
    intent_narrative: payloadJson?.intent_narrative as IntentNarrative | undefined,
  });

  if (DEBUG) {
    console.log(`[Tower][DEBUG] after judgeLeadsList: verdict=${towerResult.verdict} action=${towerResult.action} constraint_results=${towerResult.constraint_results?.length ?? 0} suggestions=${towerResult.suggested_changes.length}`);
    if (towerResult.constraint_results && towerResult.constraint_results.length > 0) {
      console.log(`[Tower][DEBUG] constraint_results preview=${JSON.stringify(towerResult.constraint_results.slice(0, 2).map((r) => ({ type: r.constraint.type, hardness: r.constraint.hardness, matched: r.matched_count, passed: r.passed })))}`);
    }
  }

  const { verdict, action } = towerVerdictToPassFail(towerResult.verdict);

  const response: JudgeArtefactResponse = {
    verdict,
    action,
    towerVerdict: towerResult.verdict,
    stop_reason: towerResult.stop_reason ?? null,
    reasons: [
      towerResult.rationale,
      ...towerResult.gaps.map((g) => `gap: ${g}`),
    ],
    metrics: {
      requested: towerResult.requested,
      delivered: towerResult.delivered,
      gaps: towerResult.gaps,
      confidence: towerResult.confidence,
      towerVerdict: towerResult.verdict,
      towerAction: towerResult.action,
      constraint_results: towerResult.constraint_results ?? [],
      _debug: towerResult._debug,
    },
    suggested_changes: towerResult.suggested_changes,
    rejected_leads: towerResult.rejected_leads,
  };

  return response;
}

router.post("/judge-artefact", async (req, res) => {
  try {
    const parsed = judgeArtefactRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ error: "Validation failed", details: issues });
      return;
    }

    const {
      runId, artefactId, goal, successCriteria, artefactType, proof_mode,
      idempotency_key, query_shape_key, steps_count, tool_calls,
      current_search_budget_pages, current_verification_level, current_radius_escalation,
    } = parsed.data;

    const idempotencyKey = idempotency_key ?? null;

    if (proof_mode) {
      const proof = buildProofVerdict(proof_mode);
      const { verdict, action } = towerVerdictToPassFail(proof.towerVerdict);
      const proofResponse: JudgeArtefactResponse = {
        verdict,
        action,
        towerVerdict: proof.towerVerdict,
        stop_reason: proof.stopReason ?? null,
        reasons: [proof.rationale],
        metrics: {
          artefactId,
          runId,
          artefactType,
          goal,
          towerVerdict: proof.towerVerdict,
          judgedAt: new Date().toISOString(),
        },
        suggested_changes: [],
      };

      console.log(`[TOWER_PROOF] run_id=${runId} artefactId=${artefactId} verdict=${proof.towerVerdict} via=judge-artefact`);

      const pr = await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: proof.towerVerdict,
        stop_reason: proof.stopReason,
        delivered: 0,
        requested: 0,
        gaps: [],
        suggested_changes: [],
        confidence: 100,
        rationale: proof.rationale,
        idempotency_key: idempotencyKey,
      });

      res.json(addPersistMeta(proofResponse, pr));
      return;
    }

    let artefactRow: any = null;
    try {
      const result = await db.execute(
        sql`SELECT id, title, summary, payload_json FROM artefacts WHERE id = ${artefactId} LIMIT 1`
      );
      artefactRow = result.rows?.[0] ?? null;
    } catch (dbErr) {
      console.error(
        "[Tower][judge-artefact] Supabase query failed:",
        dbErr instanceof Error ? dbErr.message : dbErr
      );
      const failResponse: JudgeArtefactResponse = {
        verdict: "fail",
        action: "stop",
        towerVerdict: "STOP",
        stop_reason: { code: "DB_ERROR", message: "Supabase query failed while fetching artefact" },
        reasons: ["Supabase query failed while fetching artefact"],
        metrics: {
          artefactId,
          runId,
          artefactType,
          error: "supabase_query_failed",
        },
        suggested_changes: [],
      };

      const pr = await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: "STOP",
        stop_reason: failResponse.stop_reason,
        gaps: ["DB_ERROR"],
        suggested_changes: [],
        rationale: "Supabase query failed while fetching artefact",
        idempotency_key: idempotencyKey,
      });

      res.json(addPersistMeta(failResponse, pr));
      return;
    }

    if (!artefactRow) {
      const failResponse: JudgeArtefactResponse = {
        verdict: "fail",
        action: "stop",
        towerVerdict: "STOP",
        stop_reason: { code: "ARTEFACT_NOT_FOUND", message: `Artefact not found: ${artefactId}`, evidence: { artefact_id: artefactId } },
        reasons: [`Artefact not found: ${artefactId}`],
        metrics: {
          artefactId,
          runId,
          artefactType,
          error: "artefact_not_found",
        },
        suggested_changes: [],
      };

      const pr = await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: "STOP",
        stop_reason: failResponse.stop_reason,
        gaps: ["ARTEFACT_NOT_FOUND"],
        suggested_changes: [],
        rationale: `Artefact not found: ${artefactId}`,
        idempotency_key: idempotencyKey,
      });

      res.json(addPersistMeta(failResponse, pr));
      return;
    }

    let payloadJson: any = null;
    try {
      payloadJson =
        typeof artefactRow.payload_json === "string"
          ? JSON.parse(artefactRow.payload_json)
          : artefactRow.payload_json;
    } catch {
      payloadJson = null;
    }

    if (artefactType === "leads_list" || artefactType === "final_delivery") {
      if (!payloadJson?.verification_summary) {
        try {
          const cvlResult = await db.execute(
            sql`SELECT payload_json FROM artefacts
                WHERE run_id = ${runId}
                  AND type = 'lead_verification'
                ORDER BY created_at DESC
                LIMIT 1`
          );
          const cvlRow = cvlResult.rows?.[0];
          if (cvlRow) {
            let cvlPayload: any = null;
            try {
              cvlPayload =
                typeof cvlRow.payload_json === "string"
                  ? JSON.parse(cvlRow.payload_json)
                  : cvlRow.payload_json;
            } catch {}

            if (cvlPayload) {
              if (cvlPayload.verification_summary) {
                payloadJson = payloadJson ?? {};
                payloadJson.verification_summary = cvlPayload.verification_summary;
                console.log(
                  `[Tower][judge-artefact] Merged verification_summary from lead_verification artefact for run_id=${runId} verified_exact_count=${cvlPayload.verification_summary.verified_exact_count}`
                );
              }
              if (cvlPayload.constraints_extracted && !payloadJson?.constraints_extracted) {
                payloadJson.constraints_extracted = cvlPayload.constraints_extracted;
              }
              if (cvlPayload.all_hard_satisfied != null) {
                const vs = payloadJson.verification_summary ?? {};
                if (vs.verified_exact_count == null && typeof cvlPayload.verified_exact === "number") {
                  payloadJson.verification_summary = {
                    ...vs,
                    verified_exact_count: cvlPayload.verified_exact,
                  };
                  console.log(
                    `[Tower][judge-artefact] Built verification_summary from lead_verification fields: verified_exact=${cvlPayload.verified_exact} all_hard_satisfied=${cvlPayload.all_hard_satisfied}`
                  );
                }
                if (!payloadJson.verification_summary && typeof cvlPayload.verified_exact === "number") {
                  payloadJson.verification_summary = {
                    verified_exact_count: cvlPayload.verified_exact,
                  };
                }
              }
            }
          } else {
            console.log(
              `[Tower][judge-artefact] No lead_verification artefact found for run_id=${runId}`
            );
          }
        } catch (cvlErr) {
          console.error(
            `[Tower][judge-artefact] CVL lookup failed for run_id=${runId}:`,
            cvlErr instanceof Error ? cvlErr.message : cvlErr
          );
        }
      }

      let attributeEvidenceItems: AttributeEvidenceArtefact[] = [];
      try {
        const attrEvResult = await db.execute(
          sql`SELECT payload_json FROM artefacts
              WHERE run_id = ${runId}
                AND type = 'constraint_led_evidence'
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
            console.log('[ATTR_FILTER DEBUG]', JSON.stringify({ lead_name: p?.lead_name, attribute: p?.attribute, attribute_key: p?.attribute_key, constraint: p?.constraint, verdict: p?.verdict, tower_status: p?.tower_status }));
            if (p && p.lead_name && (p.attribute || p.attribute_key || p.constraint?.value || p.constraint?.field) && (p.verdict || p.tower_status)) {
              attributeEvidenceItems.push({
                lead_name: p.lead_name,
                lead_place_id: p.lead_place_id ?? p.placeId ?? p.place_id,
                attribute: p.attribute ?? p.attribute_key ?? p.constraint?.value ?? p.constraint?.field,
                attribute_key: p.attribute_key ?? p.constraint?.value,
                attribute_raw: p.attribute_raw,
                constraint_raw: p.constraint_raw,
                verdict: p.verdict ?? p.tower_status,
                confidence: p.confidence ?? 0,
                evidence_id: p.evidence_id,
                source_url: p.source_url,
                quote: p.quote,
                extracted_quotes: Array.isArray(p.extracted_quotes) ? p.extracted_quotes.filter((q: unknown) => typeof q === "string" && q) : undefined,
                page_title: typeof p.page_title === "string" ? p.page_title : undefined,
                source_tier: p.source_tier ?? p.evidence_source_tier ?? undefined,
              });
            }
          }
          console.log(
            `[Tower][judge-artefact] Found ${attributeEvidenceItems.length} attribute_evidence artefact(s) for run_id=${runId}`
          );
          if (process.env.DEBUG_TOWER_ATTR_TRACE === "true") {
            console.log(`[TOWER][ATTR_TRACE] === attribute_evidence artefacts from DB ===`);
            console.log(`[TOWER][ATTR_TRACE] raw rows returned: ${attrEvResult.rows.length}`);
            for (const item of attributeEvidenceItems) {
              console.log(`[TOWER][ATTR_TRACE] db_artefact: lead_name="${item.lead_name}" lead_place_id="${item.lead_place_id ?? "none"}" attribute="${item.attribute}" attribute_key="${item.attribute_key ?? "none"}" verdict=${item.verdict} confidence=${item.confidence} evidence_id=${item.evidence_id ?? "none"} source_url=${item.source_url ?? "none"} quote="${(item.quote ?? "none").substring(0, 100)}"`);
            }
          }
        }
      } catch (attrEvErr) {
        console.error(
          `[Tower][judge-artefact] attribute_evidence lookup failed for run_id=${runId}:`,
          attrEvErr instanceof Error ? attrEvErr.message : attrEvErr
        );
      }

      if (attributeEvidenceItems.length > 0 && goal) {
        try {
          const rawConstraints = payloadJson?.constraints;
          const rawStructuredConstraints = Array.isArray(payloadJson?.structured_constraints) ? payloadJson.structured_constraints : undefined;
          let constraintsForSemantic: Constraint[] = [];
          if (Array.isArray(rawConstraints) && rawConstraints.length > 0) {
            constraintsForSemantic = rawConstraints
              .map((c: any) => normalizeConstraintHardness(c))
              .filter((c: Constraint | null): c is Constraint => c !== null);
          }
          if (constraintsForSemantic.length === 0 && rawStructuredConstraints && rawStructuredConstraints.length > 0) {
            constraintsForSemantic = normalizeStructuredConstraints(rawStructuredConstraints);
          }
          if (constraintsForSemantic.some(c => c.type === "HAS_ATTRIBUTE")) {
            attributeEvidenceItems = await enrichAttributeEvidence(attributeEvidenceItems, goal, constraintsForSemantic);
          }
        } catch (semanticErr) {
          console.error(
            `[Tower][judge-artefact] semantic enrichment failed for run_id=${runId}, falling back to upstream verdicts:`,
            semanticErr instanceof Error ? semanticErr.message : semanticErr
          );
        }
      }

      console.log(
        `[TOWER_IN] final_delivery_payload(judge-artefact): run_id=${runId} artefactType=${artefactType} ` +
        `leads=${Array.isArray(payloadJson?.leads) ? payloadJson.leads.length : "none"} ` +
        `delivered_leads=${Array.isArray(payloadJson?.delivered_leads) ? payloadJson.delivered_leads.length : "none"} ` +
        `delivered_count=${payloadJson?.delivered_count ?? "none"} verified_exact=${payloadJson?.verified_exact ?? "none"} ` +
        `accumulated_count=${payloadJson?.accumulated_count ?? "none"} delivered=${JSON.stringify(payloadJson?.delivered ?? "none")} ` +
        `requested_count_user=${payloadJson?.requested_count_user ?? successCriteria?.requested_count_user ?? "none"} ` +
        `requested_count=${payloadJson?.requested_count ?? successCriteria?.requested_count ?? "none"} ` +
        `verification_summary=${payloadJson?.verification_summary ? `verified_exact_count=${payloadJson.verification_summary.verified_exact_count}` : "none"}`
      );

      const leadsResult = await judgeLeadsListArtefact(
        payloadJson,
        successCriteria,
        goal,
        artefactRow.title ?? undefined,
        artefactRow.summary ?? undefined,
        attributeEvidenceItems.length > 0 ? attributeEvidenceItems : undefined
      );
      leadsResult.metrics = {
        ...leadsResult.metrics,
        artefactId,
        runId,
        artefactType,
        goal,
        artefactTitle: artefactRow.title ?? null,
        artefactSummary: artefactRow.summary ?? null,
        judgedAt: new Date().toISOString(),
      };

      console.log(
        `[Tower][judge-artefact] leads_list run_id=${runId} verdict=${leadsResult.verdict} towerVerdict=${leadsResult.towerVerdict} action=${leadsResult.action} delivered=${leadsResult.metrics.delivered} requested=${leadsResult.metrics.requested} _debug=${JSON.stringify(leadsResult.metrics._debug ?? "MISSING")}`
      );

      const learningInput: LearningUpdateInput = {
        verdict: leadsResult.towerVerdict as any,
        delivered: (leadsResult.metrics.delivered as number) ?? 0,
        requested: (leadsResult.metrics.requested as number) ?? 0,
        gaps: (leadsResult.metrics.gaps as string[]) ?? [],
        confidence: (leadsResult.metrics.confidence as number) ?? 0,
        stop_reason: leadsResult.stop_reason,
        suggested_changes: leadsResult.suggested_changes,
        constraint_results: (leadsResult.metrics.constraint_results as any) ?? undefined,
        run_id: runId,
        query_shape_key: query_shape_key,
        replans_used: (leadsResult.metrics as any)?.replans_used,
        steps_count,
        tool_calls,
        current_search_budget_pages,
        current_verification_level,
        current_radius_escalation,
      };
      const learningUpdate = evaluateLearningUpdate(learningInput);

      const pr = await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: leadsResult.towerVerdict,
        stop_reason: leadsResult.stop_reason,
        delivered: (leadsResult.metrics.delivered as number) ?? null,
        requested: (leadsResult.metrics.requested as number) ?? null,
        gaps: (leadsResult.metrics.gaps as string[]) ?? [],
        suggested_changes: leadsResult.suggested_changes,
        confidence: (leadsResult.metrics.confidence as number) ?? null,
        rationale: leadsResult.reasons[0] ?? null,
        idempotency_key: idempotencyKey,
      });

      if (!pr.duplicate) {
        const constraintResults = (leadsResult.metrics.constraint_results as any[]) ?? [];
        const bjConstraints = constraintResults.map((cr: any) => ({
          type: (cr.constraint?.type ?? "UNKNOWN") as string,
          field: (cr.constraint?.field ?? "") as string,
          value: (cr.constraint?.value ?? "") as string | number,
          hardness: (cr.constraint?.hardness ?? "hard") as "hard" | "soft",
          evidence_requirement: cr.constraint?.evidence_requirement as string | undefined,
        }));

        const bjConstraintVerdicts: ConstraintVerdictDetail[] = constraintResults.map((cr: any) => {
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
          if (cr.source_url) detail.source_url = cr.source_url;
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
          (Array.isArray(payloadJson?.leads) ? payloadJson.leads : []) as Array<{ name: string; [key: string]: unknown }>,
          (Array.isArray(payloadJson?.delivered_leads) ? payloadJson.delivered_leads : undefined) as Array<{ name: string; [key: string]: unknown }> | undefined,
          attributeEvidenceItems,
        );

        const bjIntentNarrative = (parsed.data?.successCriteria?.intent_narrative ?? parsed.data?.intent_narrative) as IntentNarrative | undefined;
        const bjQueryClass = inferQueryClass(goal, bjConstraints, bjIntentNarrative);

        const bjRequestedCount =
          (typeof successCriteria?.requested_count_user === "number" ? successCriteria.requested_count_user : null) ??
          (typeof payloadJson?.requested_count_user === "number" ? payloadJson.requested_count_user : null) ??
          (typeof successCriteria?.requested_count === "number" ? successCriteria.requested_count : null) ??
          (typeof payloadJson?.requested_count === "number" ? payloadJson.requested_count : null);
        console.log('[BJ DEBUG] full payloadJson keys:', JSON.stringify(Object.keys(payloadJson ?? {})));
        console.log('[BJ DEBUG] routes-judge-artefact intent_narrative:', JSON.stringify(bjIntentNarrative ?? null));

        fireBehaviourJudge({
          run_id: runId,
          original_goal: goal,
          strategy: payloadJson?.strategy ?? null,
          verification_policy: payloadJson?.verification_policy ?? null,
          delivered_count: (leadsResult.metrics.delivered as number) ?? 0,
          requested_count: bjRequestedCount,
          query_class: bjQueryClass,
          constraints: bjConstraints,
          constraint_verdicts: bjConstraintVerdicts,
          leads_evidence: bjLeadsEvidence,
          tower_verdict: leadsResult.towerVerdict,
          tower_gaps: (leadsResult.metrics.gaps as string[]) ?? [],
          tower_stop_reason_code: leadsResult.stop_reason?.code ?? null,
          agent_clarified: payloadJson?.agent_clarified ?? false,
          intent_narrative: bjIntentNarrative ? JSON.stringify(bjIntentNarrative) : null,
          entity_exclusions: bjIntentNarrative?.entity_exclusions ?? null,
          key_discriminator: bjIntentNarrative?.key_discriminator ?? null,
        });
      }

      res.json(addPersistMeta({
        ...leadsResult,
        ...(learningUpdate ? { learning_update: learningUpdate } : {}),
      }, pr));
      return;
    }

    if (artefactType === "run_receipt") {
      let siblingArtefacts: SiblingArtefact[] = [];
      try {
        const siblingResult = await db.execute(
          sql`SELECT id, type, payload_json FROM artefacts
              WHERE run_id = ${runId}
                AND type IN ('lead_pack', 'contact_extract')
              ORDER BY created_at DESC`
        );
        if (siblingResult.rows) {
          for (const row of siblingResult.rows) {
            let p: any = null;
            try {
              p = typeof row.payload_json === "string"
                ? JSON.parse(row.payload_json as string)
                : row.payload_json;
            } catch {}
            if (p) {
              siblingArtefacts.push({
                id: row.id as string,
                artefact_type: row.type as string,
                payload_json: p,
              });
            }
          }
        }
        console.log(
          `[Tower][judge-artefact] Found ${siblingArtefacts.length} sibling artefact(s) (lead_pack/contact_extract) for run_id=${runId}`
        );
      } catch (sibErr) {
        console.error(
          `[Tower][judge-artefact] Sibling artefact lookup failed for run_id=${runId}:`,
          sibErr instanceof Error ? sibErr.message : sibErr
        );
      }

      console.log(
        `[TOWER_IN] run_receipt_payload(judge-artefact): run_id=${runId} ` +
        `delivered_count=${payloadJson?.delivered_count ?? "none"} ` +
        `requested_count=${payloadJson?.requested_count ?? "none"} ` +
        `contacts_proven=${payloadJson?.contacts_proven ?? "none"} ` +
        `delivered_leads=${Array.isArray(payloadJson?.delivered_leads) ? payloadJson.delivered_leads.length : "none"} ` +
        `narrative_lines=${Array.isArray(payloadJson?.narrative_lines) ? payloadJson.narrative_lines.length : "none"}`
      );

      const receiptResult = judgeRunReceipt(payloadJson ?? {}, siblingArtefacts);

      const towerVerdict: "ACCEPT" | "CHANGE_PLAN" | "STOP" =
        receiptResult.verdict === "RETRY" ? "CHANGE_PLAN" : receiptResult.verdict;
      const { verdict: rVerdict, action: rAction } = towerVerdictToPassFail(towerVerdict);

      const receiptResponse: JudgeArtefactResponse = {
        verdict: rVerdict,
        action: rAction,
        towerVerdict: towerVerdict,
        stop_reason: receiptResult.stop_reason ?? null,
        reasons: receiptResult.reasons,
        metrics: {
          artefactId,
          runId,
          artefactType,
          goal,
          ...receiptResult.metrics,
          towerVerdict: towerVerdict,
          judgedAt: new Date().toISOString(),
        },
        suggested_changes: [],
      };

      console.log(
        `[Tower][judge-artefact] run_receipt run_id=${runId} verdict=${rVerdict} towerVerdict=${towerVerdict} ` +
        `reasons=${JSON.stringify(receiptResult.reasons)}`
      );

      const pr = await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: towerVerdict,
        stop_reason: receiptResult.stop_reason,
        gaps: receiptResult.reasons.filter(r => r !== "All receipt truth checks passed"),
        suggested_changes: [],
        confidence: 100,
        rationale: receiptResult.reasons[0] ?? null,
        idempotency_key: idempotencyKey,
      });

      res.json(addPersistMeta(receiptResponse, pr));
      return;
    }

    if (artefactType === "factory_state" || artefactType === "factory_decision") {
      const plasticsConstraints = payloadJson?.constraints ?? successCriteria?.constraints;
      const factoryState = payloadJson?.factory_state;

      if (!plasticsConstraints || !factoryState || plasticsConstraints.max_scrap_percent == null || factoryState.scrap_rate_now == null) {
        const failResponse: JudgeArtefactResponse = {
          verdict: "fail",
          action: "stop",
          towerVerdict: "STOP",
          stop_reason: { code: "MISSING_PLASTICS_FIELDS", message: "Missing required plastics fields: constraints.max_scrap_percent and factory_state.scrap_rate_now" },
          reasons: ["Missing required plastics fields: constraints.max_scrap_percent and factory_state.scrap_rate_now"],
          metrics: { artefactId, runId, artefactType, error: "missing_plastics_fields" },
          suggested_changes: [],
        };

        const pr = await persistTowerVerdict({
          run_id: runId,
          artefact_id: artefactId,
          artefact_type: artefactType,
          verdict: "STOP",
          stop_reason: failResponse.stop_reason,
          gaps: ["MISSING_PLASTICS_FIELDS"],
          suggested_changes: [],
          rationale: failResponse.reasons[0],
          idempotency_key: idempotencyKey,
        });

        res.json(addPersistMeta(failResponse, pr));
        return;
      }

      const rubricInput: PlasticsRubricInput = {
        constraints: plasticsConstraints,
        factory_state: factoryState,
        factory_decision: payloadJson?.factory_decision,
        history: payloadJson?.history,
      };

      const plasticsResult = judgePlasticsInjection(rubricInput);
      const { verdict: pVerdict, action: pAction } = towerVerdictToPassFail(plasticsResult.verdict);

      const plasticsResponse: JudgeArtefactResponse = {
        verdict: pVerdict,
        action: pAction,
        towerVerdict: plasticsResult.verdict,
        stop_reason: plasticsResult.stop_reason ?? null,
        reasons: [
          plasticsResult.reason,
          ...plasticsResult.gaps.map((g) => `gap: ${g}`),
        ],
        metrics: {
          artefactId,
          runId,
          artefactType,
          goal,
          scrap_rate_now: plasticsResult.scrap_rate_now,
          max_scrap_percent: plasticsResult.max_scrap_percent,
          confidence: plasticsResult.confidence,
          towerVerdict: plasticsResult.verdict,
          towerAction: plasticsResult.action,
          step: plasticsResult.step,
          machine: plasticsResult.machine,
          judgedAt: new Date().toISOString(),
        },
        suggested_changes: plasticsResult.suggested_changes.map((s) => ({
          type: "CHANGE_QUERY",
          field: "mitigation",
          from: null,
          to: null,
          reason: s,
        })),
      };

      console.log(
        `[Tower][judge-artefact] ${artefactType} run_id=${runId} towerVerdict=${plasticsResult.verdict} action=${pAction} scrap=${plasticsResult.scrap_rate_now} max=${plasticsResult.max_scrap_percent}`
      );

      const pr = await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: plasticsResult.verdict,
        stop_reason: plasticsResult.stop_reason,
        gaps: plasticsResult.gaps,
        suggested_changes: plasticsResult.suggested_changes.map(s => ({ type: "CHANGE_QUERY", reason: s })),
        confidence: plasticsResult.confidence,
        rationale: plasticsResult.reason,
        idempotency_key: idempotencyKey,
      });

      res.json(addPersistMeta(plasticsResponse, pr));
      return;
    }

    const stepStatus = payloadJson?.step_status;
    const stepType = payloadJson?.step_type as string | undefined;
    const metrics = payloadJson?.metrics as
      | Record<string, unknown>
      | undefined;

    let canonicalVerdict: "ACCEPT" | "CHANGE_PLAN" | "STOP";
    let stopReason: StopReason | null = null;
    const reasons: string[] = [];

    if (stepStatus === "fail") {
      canonicalVerdict = "STOP";
      reasons.push(`Artefact step_status is "fail"`);
      stopReason = { code: "STEP_FAILED", message: `Artefact step_status is "fail"`, evidence: { step_type: stepType } };
    } else if (
      stepType === "SEARCH_PLACES" &&
      metrics?.places_found === 0
    ) {
      canonicalVerdict = "STOP";
      reasons.push(`SEARCH_PLACES returned 0 places_found`);
      stopReason = { code: "ZERO_RESULTS", message: "SEARCH_PLACES returned 0 places_found", evidence: { step_type: stepType } };
    } else if (stepType === "ASK_LEAD_QUESTION") {
      const askInput: AskLeadQuestionInput = {
        confidence: typeof metrics?.confidence === "number" ? metrics.confidence : 0,
        evidence_items: Array.isArray(metrics?.evidence_items) ? metrics.evidence_items as AskLeadQuestionInput["evidence_items"] : [],
        step_status: stepStatus,
        attribute_type: metrics?.attribute_type as "hard" | "soft" | undefined,
        capability_says_unverifiable: metrics?.capability_says_unverifiable === true,
        evidence_sufficient: metrics?.evidence_sufficient !== false,
      };

      const askResult = judgeAskLeadQuestion(askInput);
      const askVerdict = askResult.towerVerdict === "ACCEPT" ? "pass" as const : "fail" as const;

      const askResponse: JudgeArtefactResponse = {
        verdict: askVerdict,
        action: askResult.action,
        towerVerdict: askResult.towerVerdict,
        stop_reason: askResult.stop_reason ?? null,
        reasons: [askResult.reason, ...askResult.gaps.map((g) => `gap: ${g}`)],
        metrics: {
          ...askResult.metrics,
          artefactId,
          runId,
          artefactType,
          goal,
          towerVerdict: askResult.towerVerdict,
          judgedAt: new Date().toISOString(),
        },
        suggested_changes: askResult.suggested_changes,
      };

      const pr = await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: askResult.towerVerdict,
        stop_reason: askResult.stop_reason,
        gaps: askResult.gaps,
        suggested_changes: askResult.suggested_changes,
        confidence: askResult.confidence,
        rationale: askResult.reason,
        idempotency_key: idempotencyKey,
      });

      res.json(addPersistMeta(askResponse, pr));
      return;
    } else if (
      stepType === "ENRICH_LEADS" &&
      metrics?.leads_enriched === 0
    ) {
      canonicalVerdict = "STOP";
      reasons.push(`ENRICH_LEADS returned 0 leads_enriched`);
      stopReason = { code: "ZERO_RESULTS", message: "ENRICH_LEADS returned 0 leads_enriched", evidence: { step_type: stepType } };
    } else if (
      stepType === "SCORE_LEADS" &&
      metrics?.leads_scored === 0
    ) {
      canonicalVerdict = "STOP";
      reasons.push(`SCORE_LEADS returned 0 leads_scored`);
      stopReason = { code: "ZERO_RESULTS", message: "SCORE_LEADS returned 0 leads_scored", evidence: { step_type: stepType } };
    } else {
      canonicalVerdict = "ACCEPT";
      reasons.push(
        `Artefact step_status is "${stepStatus ?? "not set"}" — passing`
      );
    }

    const { verdict, action } = towerVerdictToPassFail(canonicalVerdict);

    const response: JudgeArtefactResponse = {
      verdict,
      action,
      towerVerdict: canonicalVerdict,
      stop_reason: stopReason,
      reasons,
      metrics: {
        artefactId,
        runId,
        artefactType,
        goal,
        artefactTitle: artefactRow.title ?? null,
        artefactSummary: artefactRow.summary ?? null,
        stepStatus: stepStatus ?? null,
        towerVerdict: canonicalVerdict,
        judgedAt: new Date().toISOString(),
      },
      suggested_changes: [],
    };

    const pr = await persistTowerVerdict({
      run_id: runId,
      artefact_id: artefactId,
      artefact_type: artefactType,
      verdict: canonicalVerdict,
      stop_reason: stopReason,
      gaps: stopReason ? [stopReason.code] : [],
      suggested_changes: [],
      rationale: reasons[0] ?? null,
      idempotency_key: idempotencyKey,
    });

    res.json(addPersistMeta(response, pr));
  } catch (err) {
    console.error(
      "[Tower][judge-artefact] Unexpected error:",
      err instanceof Error ? err.message : err
    );
    const failResponse: JudgeArtefactResponse = {
      verdict: "fail",
      action: "stop",
      towerVerdict: "STOP",
      stop_reason: { code: "INTERNAL_ERROR", message: "Unexpected error during artefact judgement" },
      reasons: ["Unexpected error during artefact judgement"],
      metrics: { error: "unexpected_error" },
      suggested_changes: [],
    };
    res.status(500).json({
      ...failResponse,
      persisted: false,
      duplicate: false,
      warning_code: "INTERNAL_ERROR",
    });
  }
});

export default router;
