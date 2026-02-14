import express from "express";
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { judgeLeadsList } from "../src/evaluator/towerVerdict";
import type { Lead, Constraint, DeliveredInfo, MetaInfo } from "../src/evaluator/towerVerdict";

const router = express.Router();

const judgeArtefactRequestSchema = z.object({
  runId: z.string().min(1),
  artefactId: z.string().min(1),
  goal: z.string().min(1),
  successCriteria: z.any().optional(),
  artefactType: z.string().min(1),
});

interface JudgeArtefactResponse {
  verdict: "pass" | "fail";
  action: "continue" | "stop" | "retry" | "change_plan";
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

  const constraints: Constraint[] = Array.isArray(payloadJson?.constraints)
    ? payloadJson.constraints.filter(
        (c: any) => c && c.type && c.field && c.value !== undefined && c.hardness
      )
    : [];

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
    artefact_title: artefactTitle,
    artefact_summary: artefactSummary,
  });

  let verdict: "pass" | "fail";
  let action: "continue" | "stop" | "retry" | "change_plan";

  if (towerResult.verdict === "ACCEPT") {
    verdict = "pass";
    action = "continue";
  } else if (towerResult.verdict === "CHANGE_PLAN") {
    verdict = "fail";
    action = "change_plan";
  } else if (towerResult.verdict === "STOP") {
    verdict = "fail";
    action = "stop";
  } else {
    verdict = "fail";
    action = "retry";
  }

  const response: JudgeArtefactResponse = {
    verdict,
    action,
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

    const { runId, artefactId, goal, successCriteria, artefactType } =
      parsed.data;

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
        reasons: ["Supabase query failed while fetching artefact"],
        metrics: {
          artefactId,
          runId,
          artefactType,
          error: "supabase_query_failed",
        },
        suggested_changes: [],
      };
      res.json(failResponse);
      return;
    }

    if (!artefactRow) {
      const failResponse: JudgeArtefactResponse = {
        verdict: "fail",
        action: "stop",
        reasons: [`Artefact not found: ${artefactId}`],
        metrics: {
          artefactId,
          runId,
          artefactType,
          error: "artefact_not_found",
        },
        suggested_changes: [],
      };
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
        `[Tower][judge-artefact] leads_list run_id=${runId} verdict=${leadsResult.verdict} action=${leadsResult.action} delivered=${leadsResult.metrics.delivered} requested=${leadsResult.metrics.requested}`
      );

      res.json(leadsResult);
      return;
    }

    const stepStatus = payloadJson?.step_status;
    const stepType = payloadJson?.step_type as string | undefined;
    const metrics = payloadJson?.metrics as
      | Record<string, unknown>
      | undefined;

    let verdict: "pass" | "fail";
    let action: "continue" | "stop" | "retry" | "change_plan";
    const reasons: string[] = [];

    if (stepStatus === "fail") {
      verdict = "fail";
      action = "stop";
      reasons.push(`Artefact step_status is "fail"`);
    } else if (
      stepType === "SEARCH_PLACES" &&
      metrics?.places_found === 0
    ) {
      verdict = "fail";
      action = "stop";
      reasons.push(`SEARCH_PLACES returned 0 places_found`);
    } else if (
      stepType === "ENRICH_LEADS" &&
      metrics?.leads_enriched === 0
    ) {
      verdict = "fail";
      action = "stop";
      reasons.push(`ENRICH_LEADS returned 0 leads_enriched`);
    } else if (
      stepType === "SCORE_LEADS" &&
      metrics?.leads_scored === 0
    ) {
      verdict = "fail";
      action = "stop";
      reasons.push(`SCORE_LEADS returned 0 leads_scored`);
    } else {
      verdict = "pass";
      action = "continue";
      reasons.push(
        `Artefact step_status is "${stepStatus ?? "not set"}" — passing`
      );
    }

    const response: JudgeArtefactResponse = {
      verdict,
      action,
      reasons,
      metrics: {
        artefactId,
        runId,
        artefactType,
        goal,
        artefactTitle: artefactRow.title ?? null,
        artefactSummary: artefactRow.summary ?? null,
        stepStatus: stepStatus ?? null,
        judgedAt: new Date().toISOString(),
      },
      suggested_changes: [],
    };

    res.json(response);
  } catch (err) {
    console.error(
      "[Tower][judge-artefact] Unexpected error:",
      err instanceof Error ? err.message : err
    );
    const failResponse: JudgeArtefactResponse = {
      verdict: "fail",
      action: "stop",
      reasons: ["Unexpected error during artefact judgement"],
      metrics: { error: "unexpected_error" },
      suggested_changes: [],
    };
    res.status(500).json(failResponse);
  }
});

export default router;
