import express from "express";
import { z } from "zod";
import { db } from "../src/lib/db";
import { policyVersions, learningArtefacts, policyNameEnum } from "../shared/schema";
import { desc, eq, and, sql } from "drizzle-orm";
import { evaluateLearningLayer } from "../src/evaluator/learningLayerRubric";
import type { LearningLayerInput, PolicySnapshot } from "../src/evaluator/learningLayerRubric";

const router = express.Router();

const decisionLogEntrySchema = z.object({
  run_id: z.string(),
  step: z.number(),
  action: z.string(),
  parameters: z.record(z.any()).optional(),
  timestamp: z.string().optional(),
});

const outcomeLogEntrySchema = z.object({
  run_id: z.string(),
  step: z.number(),
  outcome: z.enum(["success", "failure", "partial"]),
  metrics: z.record(z.any()).optional(),
  timestamp: z.string().optional(),
});

const telemetrySummarySchema = z.object({
  total_runs: z.number().int().min(0),
  success_count: z.number().int().min(0),
  failure_count: z.number().int().min(0),
  avg_duration_ms: z.number().optional(),
  avg_cost: z.number().optional(),
  outcome_delta: z.number().optional(),
  sample_window_hours: z.number().optional(),
});

const policySnapshotSchema = z.object({
  scope_key: z.string().min(1),
  policy_name: policyNameEnum,
  version: z.number().int().min(0),
  value: z.record(z.any()),
});

const learningLayerRequestSchema = z.object({
  scope_key: z.string().min(1),
  policy_name: policyNameEnum,
  decision_log: z.array(decisionLogEntrySchema).min(1),
  outcome_log: z.array(outcomeLogEntrySchema).min(1),
  telemetry: telemetrySummarySchema,
  current_policy: policySnapshotSchema,
  proposed_value: z.record(z.any()).optional(),
  run_id: z.string().optional(),
});

router.post("/learn", async (req, res) => {
  try {
    const parsed = learningLayerRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => ({
        path: i.path.join("."),
        message: i.message,
      }));
      res.status(400).json({ error: "Validation failed", details: issues });
      return;
    }

    const input: LearningLayerInput = parsed.data;
    const result = evaluateLearningLayer(input);

    if (result.verdict === "ALLOW" && result.proposed_value) {
      let latestVersion = input.current_policy.version;
      try {
        const existing = await db
          .select({ version: policyVersions.version })
          .from(policyVersions)
          .where(
            and(
              eq(policyVersions.scope_key, input.scope_key),
              eq(policyVersions.policy_name, input.policy_name)
            )
          )
          .orderBy(desc(policyVersions.version))
          .limit(1);

        if (existing.length > 0 && existing[0].version >= latestVersion) {
          latestVersion = existing[0].version;
        }
      } catch (err) {
        console.error("[LEARNING_LAYER] Failed to check latest version:", err instanceof Error ? err.message : err);
      }

      const newVersion = latestVersion + 1;
      let policyVersionId: string | null = null;

      try {
        const inserted = await db.insert(policyVersions).values({
          scope_key: input.scope_key,
          policy_name: input.policy_name,
          version: newVersion,
          value: result.proposed_value,
          source: "learning_layer",
          evidence_pointer: input.run_id ?? null,
        }).returning({ id: policyVersions.id });

        policyVersionId = inserted[0]?.id ?? null;
        console.log(`[LEARNING_LAYER] Created policy_version: scope=${input.scope_key} policy=${input.policy_name} v${newVersion} id=${policyVersionId}`);
      } catch (err) {
        console.error("[LEARNING_LAYER] Failed to insert policy_version:", err instanceof Error ? err.message : err);
      }

      try {
        await db.insert(learningArtefacts).values({
          run_id: input.run_id ?? null,
          scope_key: input.scope_key,
          policy_name: input.policy_name,
          artefact_type: "policy_update",
          old_value: input.current_policy.value,
          new_value: result.proposed_value,
          evidence_summary: result.evidence_summary,
          confidence: result.confidence,
          rollback_pointer: `policy_versions:${input.scope_key}:${input.policy_name}:v${input.current_policy.version}`,
          reason: result.reason,
        });
        console.log(`[LEARNING_LAYER] Emitted policy_update artefact: scope=${input.scope_key} policy=${input.policy_name}`);
      } catch (err) {
        console.error("[LEARNING_LAYER] Failed to persist learning artefact:", err instanceof Error ? err.message : err);
      }

      res.json({
        verdict: "ALLOW",
        policy_name: input.policy_name,
        scope_key: input.scope_key,
        old_version: input.current_policy.version,
        new_version: newVersion,
        old_value: input.current_policy.value,
        new_value: result.proposed_value,
        confidence: result.confidence,
        reason: result.reason,
        evidence_summary: result.evidence_summary,
        rollback_pointer: `policy_versions:${input.scope_key}:${input.policy_name}:v${input.current_policy.version}`,
        policy_version_id: policyVersionId,
      });
      return;
    }

    try {
      await db.insert(learningArtefacts).values({
        run_id: input.run_id ?? null,
        scope_key: input.scope_key,
        policy_name: input.policy_name,
        artefact_type: "no_learn",
        old_value: input.current_policy.value,
        new_value: result.proposed_value,
        evidence_summary: result.evidence_summary,
        confidence: result.confidence,
        rollback_pointer: null,
        reason: result.reason,
      });
      console.log(`[LEARNING_LAYER] Emitted no_learn artefact: scope=${input.scope_key} policy=${input.policy_name} deny_code=${result.deny_code}`);
    } catch (err) {
      console.error("[LEARNING_LAYER] Failed to persist no_learn artefact:", err instanceof Error ? err.message : err);
    }

    res.json({
      verdict: "DENY",
      policy_name: input.policy_name,
      scope_key: input.scope_key,
      deny_code: result.deny_code,
      reason: result.reason,
      confidence: result.confidence,
      evidence_summary: result.evidence_summary,
    });
  } catch (err) {
    console.error("[LEARNING_LAYER] Unexpected error:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/policy-versions/:scopeKey/:policyName", async (req, res) => {
  try {
    const { scopeKey, policyName } = req.params;
    const rows = await db
      .select()
      .from(policyVersions)
      .where(
        and(
          eq(policyVersions.scope_key, scopeKey),
          eq(policyVersions.policy_name, policyName)
        )
      )
      .orderBy(desc(policyVersions.version))
      .limit(20);

    res.json({ versions: rows });
  } catch (err) {
    console.error("[LEARNING_LAYER] Failed to fetch policy versions:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/learning-artefacts/:scopeKey/:policyName", async (req, res) => {
  try {
    const { scopeKey, policyName } = req.params;
    const rows = await db
      .select()
      .from(learningArtefacts)
      .where(
        and(
          eq(learningArtefacts.scope_key, scopeKey),
          eq(learningArtefacts.policy_name, policyName)
        )
      )
      .orderBy(desc(learningArtefacts.created_at))
      .limit(50);

    res.json({ artefacts: rows });
  } catch (err) {
    console.error("[LEARNING_LAYER] Failed to fetch learning artefacts:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
