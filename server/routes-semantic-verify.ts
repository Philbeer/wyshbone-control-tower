import express from "express";
import { z } from "zod";
import { judgeEvidenceSemantically } from "../src/evaluator/semanticEvidenceJudge";
import type { Constraint } from "../src/evaluator/towerVerdict";

const router = express.Router();

const semanticVerifySchema = z.object({
  original_user_goal: z.string().min(1, "original_user_goal is required"),
  constraint_to_check: z.string().min(1, "constraint_to_check is required"),
  lead_name: z.string().min(1, "lead_name is required"),
  source_url: z.string().nullable().optional(),
  evidence_text: z.union([
    z.string(),
    z.array(z.string()),
  ]).nullable().optional(),
  extracted_quotes: z.array(z.string()).nullable().optional(),
  page_title: z.string().nullable().optional(),
  attribute_raw: z.string().nullable().optional(),
  constraint_raw: z.string().nullable().optional(),
});

router.post("/semantic-verify", async (req, res) => {
  try {
    const parsed = semanticVerifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues.map(i => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
    }

    const body = parsed.data;

    const constraint: Constraint = {
      type: "HAS_ATTRIBUTE",
      field: "attribute",
      value: body.constraint_to_check,
      hardness: "hard",
    };

    let evidenceQuote: string | null = null;
    let extractedQuotes: string[] | null = null;

    if (body.extracted_quotes && body.extracted_quotes.length > 0) {
      extractedQuotes = body.extracted_quotes.filter(q => q && q.trim().length > 0);
    }

    if (typeof body.evidence_text === "string" && body.evidence_text.trim().length > 0) {
      evidenceQuote = body.evidence_text;
    } else if (Array.isArray(body.evidence_text)) {
      const validTexts = body.evidence_text.filter(t => t && t.trim().length > 0);
      if (validTexts.length > 0) {
        if (!extractedQuotes || extractedQuotes.length === 0) {
          extractedQuotes = validTexts;
        } else {
          extractedQuotes = [...extractedQuotes, ...validTexts];
        }
      }
    }

    const hasEvidence = (extractedQuotes && extractedQuotes.length > 0) ||
                        (evidenceQuote && evidenceQuote.trim().length > 0);

    if (!hasEvidence) {
      return res.status(200).json({
        judgement_type: "attribute_verification",
        satisfies: false,
        status: "insufficient_evidence",
        strength: "none",
        confidence: 0,
        reason: "No evidence text provided to evaluate.",
        supporting_quotes: [],
        matched_snippets: [],
        judge_mode: "none",
      });
    }

    console.log(
      `[Tower][semantic-verify] Processing: lead="${body.lead_name}" ` +
      `constraint="${body.constraint_to_check}" ` +
      `extracted_quotes=${extractedQuotes?.length ?? 0} ` +
      `has_evidence_text=${!!evidenceQuote} ` +
      `page_title="${body.page_title ?? "none"}"`
    );

    const judgement = await judgeEvidenceSemantically(
      body.original_user_goal,
      constraint,
      body.lead_name,
      evidenceQuote,
      body.source_url ?? null,
      extractedQuotes,
      body.page_title ?? null,
      body.constraint_raw ?? null,
      body.attribute_raw ?? null
    );

    const responseJson = {
      judgement_type: "attribute_verification",
      satisfies: judgement.satisfies === "yes",
      status: judgement.status,
      strength: judgement.strength,
      confidence: judgement.confidence,
      reason: judgement.reasoning,
      supporting_quotes: judgement.supporting_quotes,
      matched_snippets: judgement.supporting_quotes,
      judge_mode: judgement.judge_mode ?? "llm",
    };

    console.log(
      `[Tower][semantic-verify] Result: lead="${body.lead_name}" ` +
      `satisfies=${responseJson.satisfies} status=${responseJson.status} ` +
      `strength=${responseJson.strength} confidence=${responseJson.confidence} ` +
      `judge_mode=${responseJson.judge_mode} ` +
      `quotes=${JSON.stringify(responseJson.supporting_quotes)}`
    );

    return res.status(200).json(responseJson);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Tower][semantic-verify] Internal error: ${errMsg}`);
    return res.status(500).json({
      error: "Internal server error",
      message: errMsg,
    });
  }
});

export default router;
