import express from "express";
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { judgeLeadsList, normalizeConstraintHardness, normalizeStructuredConstraints } from "../src/evaluator/towerVerdict";
import type { Lead, Constraint, DeliveredInfo, MetaInfo, StructuredConstraint, StopReason } from "../src/evaluator/towerVerdict";
import { judgePlasticsInjection } from "../src/evaluator/plasticsInjectionRubric";
import type { PlasticsRubricInput } from "../src/evaluator/plasticsInjectionRubric";
import { towerVerdicts } from "../shared/schema";

const router = express.Router();

const judgeArtefactRequestSchema = z.object({
  runId: z.string().min(1),
  artefactId: z.string().min(1),
  goal: z.string().min(1),
  successCriteria: z.any().optional(),
  artefactType: z.string().min(1),
  proof_mode: z.string().optional(),
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
    console.log(`[TOWER_PERSIST] verdict=${row.verdict} run_id=${row.run_id} artefact_type=${row.artefact_type} via=judge-artefact`);
  } catch (err) {
    console.error(
      "[TOWER_PERSIST] Failed to persist tower verdict (judge-artefact):",
      err instanceof Error ? err.message : err
    );
  }
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

function towerVerdictToPassFail(v: "ACCEPT" | "CHANGE_PLAN" | "STOP"): { verdict: "pass" | "fail"; action: "continue" | "stop" | "change_plan" } {
  if (v === "ACCEPT") return { verdict: "pass", action: "continue" };
  if (v === "CHANGE_PLAN") return { verdict: "fail", action: "change_plan" };
  return { verdict: "fail", action: "stop" };
}

function judgeLeadsListArtefact(
  payloadJson: any,
  successCriteria: any,
  goal: string,
  artefactTitle?: string,
  artefactSummary?: string
): JudgeArtefactResponse {
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

  const requestedCountUser =
    successCriteria?.requested_count_user ??
    payloadJson?.requested_count_user ??
    undefined;

  const requestedCount =
    successCriteria?.requested_count ??
    payloadJson?.requested_count ??
    undefined;

  const targetCount =
    successCriteria?.target_count ??
    payloadJson?.success_criteria?.target_count ??
    undefined;

  const deliveredObj: DeliveredInfo | number | undefined = (() => {
    if (payloadJson?.delivered && typeof payloadJson.delivered === "object") {
      return payloadJson.delivered as DeliveredInfo;
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

  const towerResult = judgeLeadsList({
    leads,
    constraints,
    requested_count_user: requestedCountUser,
    requested_count: requestedCount,
    delivered: deliveredObj,
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
    },
    suggested_changes: towerResult.suggested_changes,
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

    const { runId, artefactId, goal, successCriteria, artefactType, proof_mode } =
      parsed.data;

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

      await persistTowerVerdict({
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
      });

      res.json(proofResponse);
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

      await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: "STOP",
        stop_reason: failResponse.stop_reason,
        gaps: ["DB_ERROR"],
        suggested_changes: [],
        rationale: "Supabase query failed while fetching artefact",
      });

      res.json(failResponse);
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

      await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: "STOP",
        stop_reason: failResponse.stop_reason,
        gaps: ["ARTEFACT_NOT_FOUND"],
        suggested_changes: [],
        rationale: `Artefact not found: ${artefactId}`,
      });

      res.json(failResponse);
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

    if (artefactType === "leads_list") {
      if (!payloadJson?.verification_summary) {
        try {
          const cvlResult = await db.execute(
            sql`SELECT payload_json FROM artefacts
                WHERE run_id = ${runId}
                  AND artefact_type = 'lead_verification'
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

      const leadsResult = judgeLeadsListArtefact(
        payloadJson,
        successCriteria,
        goal,
        artefactRow.title ?? undefined,
        artefactRow.summary ?? undefined
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
        `[Tower][judge-artefact] leads_list run_id=${runId} verdict=${leadsResult.verdict} towerVerdict=${leadsResult.towerVerdict} action=${leadsResult.action} delivered=${leadsResult.metrics.delivered} requested=${leadsResult.metrics.requested}`
      );

      await persistTowerVerdict({
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
      });

      res.json(leadsResult);
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

        await persistTowerVerdict({
          run_id: runId,
          artefact_id: artefactId,
          artefact_type: artefactType,
          verdict: "STOP",
          stop_reason: failResponse.stop_reason,
          gaps: ["MISSING_PLASTICS_FIELDS"],
          suggested_changes: [],
          rationale: failResponse.reasons[0],
        });

        res.json(failResponse);
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

      await persistTowerVerdict({
        run_id: runId,
        artefact_id: artefactId,
        artefact_type: artefactType,
        verdict: plasticsResult.verdict,
        stop_reason: plasticsResult.stop_reason,
        gaps: plasticsResult.gaps,
        suggested_changes: plasticsResult.suggested_changes.map(s => ({ type: "CHANGE_QUERY", reason: s })),
        confidence: plasticsResult.confidence,
        rationale: plasticsResult.reason,
      });

      res.json(plasticsResponse);
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

    await persistTowerVerdict({
      run_id: runId,
      artefact_id: artefactId,
      artefact_type: artefactType,
      verdict: canonicalVerdict,
      stop_reason: stopReason,
      gaps: stopReason ? [stopReason.code] : [],
      suggested_changes: [],
      rationale: reasons[0] ?? null,
    });

    res.json(response);
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
    res.status(500).json(failResponse);
  }
});

export default router;
