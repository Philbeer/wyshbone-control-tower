import { openai } from "../lib/openai";
import type { DevBrief } from "./juniorDev";
import { buildDevBrief, createPatchSuggestion, evaluatePatchSuggestion } from "./juniorDev";
import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { eq } from "drizzle-orm";
import type { PatchEvaluator } from "./patchEvaluator";

const SYSTEM_PROMPT = `You are a junior developer for the Wyshbone SaaS platform.
Your only job is to produce small, targeted code patches in the form of unified diffs that fix a specific behavioural issue.

CRITICAL CONSTRAINTS:
- Do NOT modify Wyshbone Tower evaluator code, patch evaluator, or auto-detection logic
- Do NOT modify database schema files or migration files
- Prefer changing Wyshbone UI or Supervisor behaviour implementation and prompts
- Keep changes minimal: 1-3 files maximum
- No wholesale rewrites - only targeted fixes
- Do not introduce new dependencies unless absolutely necessary

OUTPUT FORMAT:
- You must emit ONLY a unified diff patch
- No explanations, no markdown code fences, no commentary
- Start directly with "diff --git ..."
- If you cannot propose a safe patch, output exactly: NO_PATCH_POSSIBLE`;

function buildUserPrompt(brief: DevBrief): string {
  const briefJson = JSON.stringify({
    investigationId: brief.investigationId,
    trigger: brief.trigger,
    notes: brief.notes,
    diagnosis: brief.diagnosis,
    runContext: brief.runContext,
    runMeta: brief.runMeta,
  }, null, 2);

  return `Here is an investigation brief for a failing behaviour test:

${briefJson}

Your task:
- Produce a minimal unified diff that fixes this behaviour failure
- Only change the parts of Wyshbone UI or Supervisor that determine the assistant's behaviour and responses
- Keep the diff as small and safe as possible
- Focus on the specific issue mentioned in the diagnosis

Output format:
- If you can propose a patch: output ONLY the unified diff (starting with "diff --git ...")
- If you cannot propose a safe patch: output exactly "NO_PATCH_POSSIBLE"`;
}

function validateUnifiedDiff(text: string): boolean {
  const lines = text.split('\n');
  if (lines.length === 0) return false;
  
  const firstLine = lines[0].trim();
  if (!/^diff --git \S+ \S+$/.test(firstLine)) {
    return false;
  }
  
  let hasMinusHeader = false;
  let hasPlusHeader = false;
  let hasHunkMarker = false;
  let hasHunkContent = false;
  
  for (const line of lines) {
    if (line.startsWith('---')) {
      hasMinusHeader = true;
    }
    if (line.startsWith('+++')) {
      hasPlusHeader = true;
    }
    if (line.startsWith('@@')) {
      hasHunkMarker = true;
    }
    if (hasHunkMarker && (line.startsWith('+') || line.startsWith('-')) && !line.startsWith('+++') && !line.startsWith('---')) {
      hasHunkContent = true;
    }
  }
  
  return hasMinusHeader && hasPlusHeader && hasHunkMarker && hasHunkContent;
}

async function generatePatchFromBrief(brief: DevBrief): Promise<string> {
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildUserPrompt(brief) },
  ];

  const response = await openai.chat.completions.create({
    model: process.env.EVAL_MODEL_ID ?? "gpt-4o-mini",
    messages,
    temperature: 0.2,
  });

  const text = response.choices[0]?.message?.content?.trim() ?? "";

  if (!text) {
    throw new Error("Empty response from LLM");
  }

  if (text === "NO_PATCH_POSSIBLE" || text.includes("NO_PATCH_POSSIBLE")) {
    throw new Error("NO_PATCH_POSSIBLE");
  }

  let extractedDiff = text;

  if (text.includes("```")) {
    const codeBlockMatch = text.match(/```(?:diff)?\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      extractedDiff = codeBlockMatch[1].trim();
    }
  }

  if (!validateUnifiedDiff(extractedDiff)) {
    console.error('[AutoPatch] Invalid diff format received from LLM');
    throw new Error("NO_PATCH_POSSIBLE");
  }

  return extractedDiff;
}

export async function requestAutoPatchForInvestigation(
  investigationId: string,
  patchEvaluator: PatchEvaluator
): Promise<{
  suggestionId: string;
  evaluation?: {
    status: "approved" | "rejected";
    evaluationId: string;
    reasons: string[];
    riskLevel: "low" | "medium" | "high";
  };
}> {
  const inv = await db.query.investigations.findFirst({
    where: eq(investigations.id, investigationId),
  });

  if (!inv) {
    throw new Error(`Investigation ${investigationId} not found`);
  }

  console.log(`[AutoPatch] Generating auto-patch for investigation ${investigationId}`);

  const brief = await buildDevBrief(investigationId);
  console.log(`[AutoPatch] Built dev brief`);

  let patchText: string;
  try {
    patchText = await generatePatchFromBrief(brief);
    console.log(`[AutoPatch] Generated patch (${patchText.length} chars)`);
  } catch (error: any) {
    if (error.message === "NO_PATCH_POSSIBLE") {
      console.log(`[AutoPatch] LLM returned NO_PATCH_POSSIBLE`);
      throw new Error("NO_PATCH_POSSIBLE");
    }
    console.error(`[AutoPatch] Failed to generate patch:`, error);
    throw error;
  }

  const title = inv.notes?.split('\n')[0] || "Auto-generated patch";
  const summary = `Auto-generated patch for: ${title.substring(0, 100)}`;

  const suggestion = await createPatchSuggestion({
    investigationId,
    runId: inv.run_id || undefined,
    source: "auto",
    patchText,
    summary,
  });
  console.log(`[AutoPatch] Created patch suggestion ${suggestion.id}`);

  try {
    const evalResult = await evaluatePatchSuggestion(suggestion.id, patchEvaluator);
    console.log(`[AutoPatch] Evaluation complete: ${evalResult.evaluation.status}`);

    return {
      suggestionId: suggestion.id,
      evaluation: {
        status: evalResult.evaluation.status as "approved" | "rejected",
        evaluationId: evalResult.evaluation.id,
        reasons: evalResult.evaluation.reasons || [],
        riskLevel: evalResult.evaluation.riskLevel || "medium",
      },
    };
  } catch (error: any) {
    console.error(`[AutoPatch] Evaluation failed:`, error);
    return {
      suggestionId: suggestion.id,
      evaluation: undefined,
    };
  }
}
