import express from "express";
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { judgeLeadsList } from "../src/evaluator/towerVerdict";

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
}

function judgeLeadsListArtefact(
  payloadJson: any,
  successCriteria: any,
  goal: string
): JudgeArtefactResponse {
  const targetCount =
    successCriteria?.target_count ??
    payloadJson?.success_criteria?.target_count ??
    payloadJson?.target_count ??
    successCriteria?.requested_count ??
    payloadJson?.requested_count ??
    undefined;

  const prefix =
    successCriteria?.prefix ??
    payloadJson?.prefix_filter ??
    payloadJson?.success_criteria?.prefix ??
    payloadJson?.constraints?.prefix ??
    undefined;

  const constraintsCount =
    successCriteria?.count ??
    payloadJson?.constraints?.count ??
    undefined;

  const deliveredCount =
    successCriteria?.delivered_count ??
    successCriteria?.delivered ??
    payloadJson?.delivered_count ??
    payloadJson?.delivered ??
    (Array.isArray(payloadJson?.leads) ? payloadJson.leads.length : undefined);

  const leads = Array.isArray(payloadJson?.leads) ? payloadJson.leads : undefined;

  const requestedCount =
    successCriteria?.requested_count ?? payloadJson?.requested_count ?? undefined;

  console.log(
    `[Tower][judge-artefact] leads_list resolution: targetCount=${targetCount} requestedCount=${requestedCount} deliveredCount=${deliveredCount} prefix=${prefix}`
  );

  const towerResult = judgeLeadsList({
    leads,
    success_criteria: targetCount != null ? { target_count: targetCount } : undefined,
    constraints: {
      ...(constraintsCount != null ? { count: constraintsCount } : {}),
      ...(prefix != null ? { prefix } : {}),
    },
    requested_count: requestedCount != null ? requestedCount : undefined,
    delivered_count: deliveredCount != null ? deliveredCount : undefined,
    original_user_goal: goal,
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

  return {
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
    },
  };
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

    const { runId, artefactId, goal, successCriteria, artefactType } = parsed.data;

    let artefactRow: any = null;
    try {
      const result = await db.execute(
        sql`SELECT id, title, summary, payload_json FROM artefacts WHERE id = ${artefactId} LIMIT 1`
      );
      artefactRow = result.rows?.[0] ?? null;
    } catch (dbErr) {
      console.error("[Tower][judge-artefact] Supabase query failed:", dbErr instanceof Error ? dbErr.message : dbErr);
      const failResponse: JudgeArtefactResponse = {
        verdict: "fail",
        action: "stop",
        reasons: ["Supabase query failed while fetching artefact"],
        metrics: { artefactId, runId, artefactType, error: "supabase_query_failed" },
      };
      res.json(failResponse);
      return;
    }

    if (!artefactRow) {
      const failResponse: JudgeArtefactResponse = {
        verdict: "fail",
        action: "stop",
        reasons: [`Artefact not found: ${artefactId}`],
        metrics: { artefactId, runId, artefactType, error: "artefact_not_found" },
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
      const leadsResult = judgeLeadsListArtefact(payloadJson, successCriteria, goal);
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
    const metrics = payloadJson?.metrics as Record<string, unknown> | undefined;

    let verdict: "pass" | "fail";
    let action: "continue" | "stop" | "retry" | "change_plan";
    const reasons: string[] = [];

    if (stepStatus === "fail") {
      verdict = "fail";
      action = "stop";
      reasons.push(`Artefact step_status is "fail"`);
    } else if (stepType === "SEARCH_PLACES" && metrics?.places_found === 0) {
      verdict = "fail";
      action = "stop";
      reasons.push(`SEARCH_PLACES returned 0 places_found`);
    } else if (stepType === "ENRICH_LEADS" && metrics?.leads_enriched === 0) {
      verdict = "fail";
      action = "stop";
      reasons.push(`ENRICH_LEADS returned 0 leads_enriched`);
    } else if (stepType === "SCORE_LEADS" && metrics?.leads_scored === 0) {
      verdict = "fail";
      action = "stop";
      reasons.push(`SCORE_LEADS returned 0 leads_scored`);
    } else {
      verdict = "pass";
      action = "continue";
      reasons.push(`Artefact step_status is "${stepStatus ?? "not set"}" — passing`);
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
    };

    res.json(response);
  } catch (err) {
    console.error("[Tower][judge-artefact] Unexpected error:", err instanceof Error ? err.message : err);
    const failResponse: JudgeArtefactResponse = {
      verdict: "fail",
      action: "stop",
      reasons: ["Unexpected error during artefact judgement"],
      metrics: { error: "unexpected_error" },
    };
    res.status(500).json(failResponse);
  }
});

export default router;
