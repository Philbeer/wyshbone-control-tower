import express from "express";
import { db } from "../src/lib/db";
import { judgementEvaluations, runs } from "../shared/schema";
import { eq, desc } from "drizzle-orm";

const router = express.Router();

const EXPECTED_RESPONSE_FIELDS = [
  "requested",
  "delivered",
  "gaps",
  "rationale",
  "confidence",
] as const;

function extractResponseFields(evaluation: {
  verdict: string;
  reason_code: string;
  explanation: string;
  strategy: unknown;
  snapshot: unknown;
  success_criteria: unknown;
}): { present: string[]; missing: string[] } {
  const present: string[] = [];
  const missing: string[] = [];

  const strategyObj = (evaluation.strategy ?? {}) as Record<string, unknown>;
  const snapshotObj = (evaluation.snapshot ?? {}) as Record<string, unknown>;

  const allFields = new Set([
    ...Object.keys(strategyObj),
    ...Object.keys(snapshotObj),
  ]);

  const fieldMapping: Record<string, unknown> = {
    requested: strategyObj.requested ?? snapshotObj.requested,
    delivered: strategyObj.delivered ?? snapshotObj.delivered ?? snapshotObj.leads_found,
    gaps: strategyObj.gaps,
    rationale: strategyObj.rationale ?? evaluation.explanation,
    confidence: strategyObj.confidence,
  };

  for (const field of EXPECTED_RESPONSE_FIELDS) {
    const value = fieldMapping[field];
    if (value !== undefined && value !== null) {
      present.push(field);
    } else if (allFields.has(field)) {
      present.push(field);
    } else {
      missing.push(field);
    }
  }

  return { present, missing };
}

router.get("/run-trace", async (req, res) => {
  try {
    const { runId, crid } = req.query;

    if (!runId && !crid) {
      return res
        .status(400)
        .json({ error: "Provide runId or crid query parameter" });
    }

    let resolvedRunId = runId as string | undefined;

    if (!resolvedRunId && crid) {
      const run = await db.query.runs.findFirst({
        where: eq(runs.conversation_run_id, crid as string),
        orderBy: [desc(runs.created_at)],
      });
      if (run) {
        resolvedRunId = run.id;
      }
    }

    if (!resolvedRunId) {
      return res.json({
        run_ref: crid || runId || null,
        received_requests: [],
        latest_verdict: null,
        response_shape: null,
        logs_present: false,
        suspected_breakpoint: "no_requests_received",
      });
    }

    const evaluations = await db
      .select()
      .from(judgementEvaluations)
      .where(eq(judgementEvaluations.run_id, resolvedRunId))
      .orderBy(desc(judgementEvaluations.evaluated_at))
      .limit(5);

    if (evaluations.length === 0) {
      return res.json({
        run_ref: resolvedRunId,
        received_requests: [],
        latest_verdict: null,
        response_shape: null,
        logs_present: false,
        suspected_breakpoint: "no_requests_received",
      });
    }

    const receivedRequests = evaluations.map((e) => ({
      id: e.id,
      verdict: e.verdict,
      reason_code: e.reason_code,
      mission_type: e.mission_type,
      evaluated_at: e.evaluated_at,
    }));

    const latest = evaluations[0];

    const latestVerdict = {
      verdict: latest.verdict,
      reason_code: latest.reason_code,
      explanation: latest.explanation,
      strategy: latest.strategy,
      evaluated_at: latest.evaluated_at,
    };

    const { present, missing } = extractResponseFields(latest);

    const responseShape = {
      expected: [...EXPECTED_RESPONSE_FIELDS],
      present,
      missing,
    };

    const hasLogs =
      latest.explanation !== undefined &&
      latest.explanation !== null &&
      latest.explanation.length > 0;

    let suspectedBreakpoint: string;

    if (!latest.verdict && !latest.explanation) {
      suspectedBreakpoint = "request_received_but_error";
    } else if (missing.length > 0) {
      suspectedBreakpoint = "response_missing_fields";
    } else {
      suspectedBreakpoint = "all_good";
    }

    return res.json({
      run_ref: resolvedRunId,
      received_requests: receivedRequests,
      latest_verdict: latestVerdict,
      response_shape: responseShape,
      logs_present: hasLogs,
      suspected_breakpoint: suspectedBreakpoint,
    });
  } catch (err) {
    console.error("[RunTrace] Error:", err instanceof Error ? err.message : err);
    return res.status(500).json({
      error: "Failed to generate run trace report",
      details: err instanceof Error ? err.message : "Unknown error",
      suspected_breakpoint: "request_received_but_error",
    });
  }
});

export default router;
