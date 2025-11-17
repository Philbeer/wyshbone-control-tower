import { openai } from "../lib/openai";
import { db } from "../lib/db";
import { investigations } from "../../shared/schema";
import { eq, sql } from "drizzle-orm";
import type { PatchFailureAnalysis, PatchFailureMeta } from "./types";

const SYSTEM_PROMPT = `You are an expert code reviewer analyzing why an automatically generated code patch was rejected by a strict CI/CD gatekeeper.

Your job is to:
1. Understand what the original issue was
2. Understand what the patch attempted to do
3. Analyze why the patch was rejected (which tests failed, what errors occurred)
4. Provide actionable next steps for fixing the issue

Be concise, specific, and actionable.`;

function buildAnalysisPrompt(patchFailureMeta: PatchFailureMeta, originalInvestigationNotes?: string, originalDiagnosis?: string): string {
  const { original_investigation_id, patch_diff, sandbox_result } = patchFailureMeta;
  
  return `# Patch Failure Post-Mortem

## Original Problem
Investigation ID: ${original_investigation_id}

${originalInvestigationNotes ? `Investigation Notes:\n${originalInvestigationNotes}\n\n` : ''}${originalDiagnosis ? `Original Diagnosis:\n${originalDiagnosis}\n\n` : ''}

## Attempted Patch
\`\`\`diff
${patch_diff}
\`\`\`

## Sandbox Evaluation Result
Status: ${sandbox_result.status}
Risk Level: ${sandbox_result.riskLevel || 'unknown'}

### Rejection Reasons:
${sandbox_result.reasons.map(r => `- ${r}`).join('\n')}

${sandbox_result.diff ? `
### Test Result Changes:
- Status Changes: ${JSON.stringify(sandbox_result.diff.statusChanges || {})}
- Tests that failed after patch: ${sandbox_result.testResultsAfter?.filter((t: any) => t.status === 'fail').map((t: any) => t.testId).join(', ') || 'none'}
- Tests that errored after patch: ${sandbox_result.testResultsAfter?.filter((t: any) => t.status === 'error').map((t: any) => t.testId).join(', ') || 'none'}
` : ''}

## Your Analysis Task

Provide a structured analysis in the following JSON format:

\`\`\`json
{
  "failure_reason": "A concise explanation of why this patch was rejected (1-2 sentences)",
  "failure_category": "one of: broke_existing_tests, did_not_fix_original_issue, misinterpreted_requirement, test_is_ambiguous_or_wrong, wrong_repo_or_layer, insufficient_context, other",
  "next_step": "Clear recommendation for what should happen next (e.g., 'Generate a new patch with stricter constraints...', 'Clarify the behaviour test...', 'This change belongs in the UI repo...', 'Requires human review...')",
  "suggested_constraints_for_next_patch": "Optional: Specific hints for the next auto-patch attempt (e.g., 'do not modify file X', 'only change prompt section Y', 'avoid touching routing logic'). Omit if not applicable."
}
\`\`\`

Important:
- Be specific about which tests failed and why
- If the patch broke existing tests, explain which tests and what might have caused it
- If the patch didn't fix the original issue, explain what was missing
- If the test itself seems wrong or ambiguous, explain why
- If this belongs in a different repo (UI/Supervisor instead of Tower), say so clearly`;
}

export async function analyzePatchFailure(investigationId: string): Promise<PatchFailureAnalysis> {
  console.log(`[PatchFailureAnalysis] Analyzing patch failure for investigation ${investigationId}`);

  // Load the investigation
  const inv = await db.query.investigations.findFirst({
    where: eq(investigations.id, investigationId),
  });

  if (!inv) {
    throw new Error(`Investigation ${investigationId} not found`);
  }

  const runMeta = inv.run_meta as PatchFailureMeta;
  
  if (!runMeta || runMeta.source !== "patch_failure") {
    throw new Error(`Investigation ${investigationId} is not a patch failure investigation`);
  }

  // Load the original investigation for context
  let originalInvestigationNotes: string | undefined;
  let originalDiagnosis: string | undefined;
  
  try {
    const originalInv = await db.query.investigations.findFirst({
      where: eq(investigations.id, runMeta.original_investigation_id),
    });
    
    if (originalInv) {
      originalInvestigationNotes = originalInv.notes ?? undefined;
      originalDiagnosis = originalInv.diagnosis ?? undefined;
    }
  } catch (err) {
    console.warn(`[PatchFailureAnalysis] Could not load original investigation ${runMeta.original_investigation_id}:`, err);
  }

  // Call LLM for analysis
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "user" as const, content: buildAnalysisPrompt(runMeta, originalInvestigationNotes, originalDiagnosis) },
  ];

  const response = await openai.chat.completions.create({
    model: process.env.EVAL_MODEL_ID ?? "gpt-4o-mini",
    messages,
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content?.trim() ?? "";
  
  if (!content) {
    throw new Error("Empty response from LLM");
  }

  // Extract JSON from response
  let analysis: PatchFailureAnalysis;
  try {
    // Try to extract JSON from code blocks if present
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
    const jsonText = jsonMatch ? jsonMatch[1] : content;
    
    analysis = JSON.parse(jsonText);
  } catch (err) {
    console.error('[PatchFailureAnalysis] Failed to parse LLM response as JSON:', content);
    
    // Fallback to a basic analysis
    analysis = {
      failure_reason: "Failed to parse LLM analysis response",
      failure_category: "other",
      next_step: "Manual review required - LLM analysis parsing failed",
    };
  }

  // Validate the analysis structure
  const validCategories = ["broke_existing_tests", "did_not_fix_original_issue", "misinterpreted_requirement", "test_is_ambiguous_or_wrong", "wrong_repo_or_layer", "insufficient_context", "other"];
  
  if (!validCategories.includes(analysis.failure_category)) {
    console.warn(`[PatchFailureAnalysis] Invalid failure_category: ${analysis.failure_category}, defaulting to 'other'`);
    analysis.failure_category = "other";
  }

  // Store the analysis back in the investigation
  const updatedMeta = {
    ...runMeta,
    analysis,
  };

  // Also create a human-readable diagnosis
  const diagnosis = `# Patch Failure Analysis

**Failure Category:** ${analysis.failure_category}

**Why it failed:**
${analysis.failure_reason}

**Recommended Next Step:**
${analysis.next_step}

${analysis.suggested_constraints_for_next_patch ? `**Constraints for Next Patch:**\n${analysis.suggested_constraints_for_next_patch}` : ''}`;

  await db
    .update(investigations)
    .set({
      run_meta: updatedMeta as any,
      diagnosis,
    })
    .where(eq(investigations.id, investigationId));

  console.log(`[PatchFailureAnalysis] Analysis complete and stored for investigation ${investigationId}`);

  return analysis;
}
