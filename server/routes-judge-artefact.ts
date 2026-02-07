import express from "express";
import { db } from "../src/lib/db";
import { sql } from "drizzle-orm";
import { z } from "zod";

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

    const { runId, artefactId, goal, artefactType } = parsed.data;

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
